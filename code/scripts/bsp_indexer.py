#!/usr/bin/env python3
"""
BSP Indexer - 서버 측 고속 인덱싱 스크립트
Yocto/BSP 프로젝트를 로컬 파일 시스템에서 직접 파싱하여 SQLite DB 생성

사용법:
    python3 bsp_indexer.py /path/to/project [--output /path/to/index.db]

성능:
    - 10,000개 파일 기준 ~30초 (vs SSH 개별 읽기 ~10분)
"""

import os
import re
import sys
import json
import sqlite3
import hashlib
import argparse
from pathlib import Path
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

# 파일 확장자 매핑
FILE_TYPES = {
    '.bb': 'recipe',
    '.bbappend': 'recipe',
    '.inc': 'recipe',
    '.conf': 'config',
    '.h': 'header',
    '.dts': 'dts',
    '.dtsi': 'dts',
}

# 제외할 경로 패턴
EXCLUDE_PATTERNS = [
    '*/tmp/work/*',
    '*/.git/*',
    '*/sstate-cache/*',
    '*/downloads/*',
]

class BspIndexer:
    def __init__(self, project_path: str, output_path: str = None):
        self.project_path = Path(project_path).resolve()
        self.output_path = output_path or str(self.project_path / '.bsp-index' / 'index.bspidx')
        self.conn = None
        self.stats = {
            'files': 0,
            'symbols': 0,
            'includes': 0,
            'dt_nodes': 0,
            'gpio_pins': 0,
        }
        
    def run(self):
        """메인 실행"""
        print(f"[BSP Indexer] Project: {self.project_path}")
        print(f"[BSP Indexer] Output: {self.output_path}")
        
        start_time = datetime.now()
        
        # 출력 디렉토리 생성
        os.makedirs(os.path.dirname(self.output_path), exist_ok=True)
        
        # DB 초기화
        self.init_db()
        
        # 파일 스캔
        files = self.scan_files()
        print(f"[BSP Indexer] Found {len(files)} files to index")
        
        # 병렬 파싱
        self.parse_files_parallel(files)
        
        # 메타데이터 저장
        self.save_metadata()
        
        # 통계 출력
        elapsed = (datetime.now() - start_time).total_seconds()
        print(f"\n[BSP Indexer] Completed in {elapsed:.1f}s")
        print(f"  Files: {self.stats['files']}")
        print(f"  Symbols: {self.stats['symbols']}")
        print(f"  Includes: {self.stats['includes']}")
        print(f"  DT Nodes: {self.stats['dt_nodes']}")
        
        self.conn.close()
        
        # 메타 JSON 저장
        self.save_meta_json(elapsed)
        
        return self.output_path
    
    def init_db(self):
        """SQLite DB 초기화"""
        # 기존 DB 삭제
        if os.path.exists(self.output_path):
            os.remove(self.output_path)
        
        self.conn = sqlite3.connect(self.output_path)
        self.conn.execute("PRAGMA journal_mode = WAL")
        self.conn.execute("PRAGMA synchronous = NORMAL")
        self.conn.execute("PRAGMA cache_size = -64000")
        
        # 테이블 생성
        self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                size INTEGER,
                mtime INTEGER
            );
            CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
            CREATE INDEX IF NOT EXISTS idx_files_type ON files(type);
            
            CREATE TABLE IF NOT EXISTS symbols (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                value TEXT,
                type TEXT NOT NULL,
                file_id INTEGER,
                line INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
            CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file_id);
            
            CREATE TABLE IF NOT EXISTS includes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                from_file_id INTEGER,
                to_path TEXT NOT NULL,
                type TEXT NOT NULL,
                line INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_includes_from ON includes(from_file_id);
            CREATE INDEX IF NOT EXISTS idx_includes_to ON includes(to_path);
            
            CREATE TABLE IF NOT EXISTS dt_nodes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_id INTEGER,
                path TEXT NOT NULL,
                name TEXT NOT NULL,
                label TEXT,
                address TEXT,
                parent_id INTEGER,
                start_line INTEGER NOT NULL,
                end_line INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_dt_nodes_path ON dt_nodes(path);
            CREATE INDEX IF NOT EXISTS idx_dt_nodes_label ON dt_nodes(label);
            CREATE INDEX IF NOT EXISTS idx_dt_nodes_file ON dt_nodes(file_id);
            
            CREATE TABLE IF NOT EXISTS dt_properties (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                node_id INTEGER,
                name TEXT NOT NULL,
                value TEXT,
                line INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_dt_props_node ON dt_properties(node_id);
            CREATE INDEX IF NOT EXISTS idx_dt_props_name ON dt_properties(name);
            
            CREATE TABLE IF NOT EXISTS gpio_pins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_id INTEGER,
                controller TEXT NOT NULL,
                pin INTEGER NOT NULL,
                label TEXT,
                function TEXT,
                direction TEXT
            );
            
            CREATE TABLE IF NOT EXISTS metadata (
                key TEXT PRIMARY KEY,
                value TEXT
            );
            
            -- FTS5 전문 검색
            CREATE VIRTUAL TABLE IF NOT EXISTS symbols_fts USING fts5(
                name, value, content='symbols', content_rowid='id'
            );
            
            -- FTS 트리거
            CREATE TRIGGER IF NOT EXISTS symbols_ai AFTER INSERT ON symbols BEGIN
                INSERT INTO symbols_fts(rowid, name, value) VALUES (new.id, new.name, new.value);
            END;
        """)
        self.conn.commit()
    
    def scan_files(self) -> list:
        """파일 스캔"""
        files = []
        
        for root, dirs, filenames in os.walk(self.project_path):
            # 제외 패턴 체크
            rel_root = os.path.relpath(root, self.project_path)
            skip = False
            for pattern in EXCLUDE_PATTERNS:
                if self._match_pattern(rel_root, pattern):
                    skip = True
                    break
            if skip:
                dirs.clear()  # 하위 디렉토리도 스킵
                continue
            
            for filename in filenames:
                ext = os.path.splitext(filename)[1].lower()
                if ext in FILE_TYPES:
                    filepath = os.path.join(root, filename)
                    files.append({
                        'path': filepath,
                        'name': filename,
                        'type': FILE_TYPES[ext],
                        'ext': ext,
                    })
        
        return files
    
    def _match_pattern(self, path: str, pattern: str) -> bool:
        """간단한 glob 패턴 매칭"""
        import fnmatch
        return fnmatch.fnmatch(path, pattern) or fnmatch.fnmatch('/' + path, pattern)
    
    def parse_files_parallel(self, files: list, max_workers: int = 8):
        """병렬 파싱"""
        total = len(files)
        processed = 0
        
        # 배치 크기
        batch_size = 100
        
        for i in range(0, len(files), batch_size):
            batch = files[i:i+batch_size]
            results = []
            
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = {executor.submit(self.parse_file, f): f for f in batch}
                for future in as_completed(futures):
                    try:
                        result = future.result()
                        if result:
                            results.append(result)
                    except Exception as e:
                        pass  # 에러 무시
            
            # 배치 단위로 DB 삽입
            self.insert_batch(results)
            
            processed += len(batch)
            progress = processed / total * 100
            print(f"\r[BSP Indexer] Progress: {processed}/{total} ({progress:.1f}%)", end='', flush=True)
        
        print()  # 줄바꿈
    
    def parse_file(self, file_info: dict) -> dict:
        """단일 파일 파싱"""
        try:
            filepath = file_info['path']
            stat = os.stat(filepath)
            
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            
            result = {
                'file': {
                    'path': os.path.relpath(filepath, self.project_path),
                    'name': file_info['name'],
                    'type': file_info['type'],
                    'size': stat.st_size,
                    'mtime': int(stat.st_mtime),
                },
                'symbols': [],
                'includes': [],
                'dt_nodes': [],
                'dt_properties': [],
            }
            
            if file_info['type'] == 'recipe' or file_info['type'] == 'config':
                self._parse_bitbake(content, result)
            elif file_info['type'] == 'dts':
                self._parse_dts(content, result)
            elif file_info['type'] == 'header':
                self._parse_header(content, result)
            
            return result
            
        except Exception as e:
            return None
    
    def _parse_bitbake(self, content: str, result: dict):
        """BitBake 파일 파싱"""
        lines = content.split('\n')
        
        for i, line in enumerate(lines):
            line_num = i + 1
            stripped = line.strip()
            
            # 변수 정의: VAR = "value" 또는 VAR ?= "value"
            match = re.match(r'^([A-Za-z_][A-Za-z0-9_-]*)\s*(\??\+?=|:=|\.=)\s*["\']?([^"\']*)', stripped)
            if match:
                result['symbols'].append({
                    'name': match.group(1),
                    'value': match.group(3)[:200],  # 값 길이 제한
                    'type': 'variable',
                    'line': line_num,
                })
            
            # require/include
            match = re.match(r'^(require|include)\s+["\'"]?([^"\'\s]+)', stripped)
            if match:
                result['includes'].append({
                    'to_path': match.group(2),
                    'type': match.group(1),
                    'line': line_num,
                })
            
            # inherit
            match = re.match(r'^inherit\s+(.+)', stripped)
            if match:
                classes = match.group(1).split()
                for cls in classes:
                    result['includes'].append({
                        'to_path': f"classes/{cls}.bbclass",
                        'type': 'inherit',
                        'line': line_num,
                    })
    
    def _parse_dts(self, content: str, result: dict):
        """Device Tree 파싱"""
        lines = content.split('\n')
        
        node_stack = []  # (path, label)
        current_path = ''
        
        for i, line in enumerate(lines):
            line_num = i + 1
            stripped = line.strip()
            
            # #include
            match = re.match(r'#include\s*[<"]([^>"]+)[>"]', stripped)
            if match:
                result['includes'].append({
                    'to_path': match.group(1),
                    'type': '#include',
                    'line': line_num,
                })
                continue
            
            # 노드 정의: label: name@address { 또는 name { 또는 &label {
            match = re.match(r'^(?:(\w+)\s*:\s*)?(\S+?)(?:@([0-9a-fA-F]+))?\s*\{', stripped)
            if match:
                label = match.group(1)
                name = match.group(2)
                address = match.group(3)
                
                if name.startswith('&'):
                    # 오버라이드 노드
                    new_path = name
                else:
                    new_path = f"{current_path}/{name}" if current_path else f"/{name}"
                
                node_stack.append((current_path, line_num))
                current_path = new_path
                
                result['dt_nodes'].append({
                    'path': new_path,
                    'name': name,
                    'label': label,
                    'address': address,
                    'start_line': line_num,
                    'end_line': line_num,  # 나중에 업데이트
                })
                
                # 라벨이 있으면 심볼로도 저장
                if label:
                    result['symbols'].append({
                        'name': label,
                        'value': new_path,
                        'type': 'label',
                        'line': line_num,
                    })
                continue
            
            # 닫는 브레이스
            if stripped == '};' or stripped == '}':
                if node_stack:
                    parent_path, start_line = node_stack.pop()
                    # 마지막 노드의 end_line 업데이트
                    for node in reversed(result['dt_nodes']):
                        if node['path'] == current_path:
                            node['end_line'] = line_num
                            break
                    current_path = parent_path
                continue
            
            # 속성: name = value; 또는 name;
            match = re.match(r'^([\w,#-]+)\s*(?:=\s*(.+?))?;$', stripped)
            if match and current_path:
                prop_name = match.group(1)
                prop_value = match.group(2) or ''
                
                result['dt_properties'].append({
                    'node_path': current_path,
                    'name': prop_name,
                    'value': prop_value[:500],  # 값 길이 제한
                    'line': line_num,
                })
                
                # &label 참조 추출
                for ref_match in re.finditer(r'&(\w+)', prop_value):
                    ref_label = ref_match.group(1)
                    result['symbols'].append({
                        'name': f"&{ref_label}",
                        'value': ref_label,
                        'type': 'label_ref',
                        'line': line_num,
                    })
    
    def _parse_header(self, content: str, result: dict):
        """헤더 파일 파싱"""
        lines = content.split('\n')
        
        for i, line in enumerate(lines):
            line_num = i + 1
            stripped = line.strip()
            
            # #define MACRO value
            match = re.match(r'^#define\s+([A-Za-z_][A-Za-z0-9_]*)\s*(.*)', stripped)
            if match:
                result['symbols'].append({
                    'name': match.group(1),
                    'value': match.group(2)[:200],
                    'type': 'define',
                    'line': line_num,
                })
            
            # #include
            match = re.match(r'^#include\s*[<"]([^>"]+)[>"]', stripped)
            if match:
                result['includes'].append({
                    'to_path': match.group(1),
                    'type': '#include',
                    'line': line_num,
                })
    
    def insert_batch(self, results: list):
        """배치 DB 삽입"""
        cursor = self.conn.cursor()
        
        for result in results:
            if not result:
                continue
            
            # 파일 삽입
            cursor.execute("""
                INSERT OR REPLACE INTO files (path, name, type, size, mtime)
                VALUES (?, ?, ?, ?, ?)
            """, (
                result['file']['path'],
                result['file']['name'],
                result['file']['type'],
                result['file']['size'],
                result['file']['mtime'],
            ))
            file_id = cursor.lastrowid
            self.stats['files'] += 1
            
            # 심볼 삽입
            for sym in result['symbols']:
                cursor.execute("""
                    INSERT INTO symbols (name, value, type, file_id, line)
                    VALUES (?, ?, ?, ?, ?)
                """, (sym['name'], sym.get('value'), sym['type'], file_id, sym['line']))
                self.stats['symbols'] += 1
            
            # Include 삽입
            for inc in result['includes']:
                cursor.execute("""
                    INSERT INTO includes (from_file_id, to_path, type, line)
                    VALUES (?, ?, ?, ?)
                """, (file_id, inc['to_path'], inc['type'], inc['line']))
                self.stats['includes'] += 1
            
            # DT 노드 삽입
            node_id_map = {}  # path -> id
            for node in result['dt_nodes']:
                cursor.execute("""
                    INSERT INTO dt_nodes (file_id, path, name, label, address, parent_id, start_line, end_line)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    file_id, node['path'], node['name'], node.get('label'),
                    node.get('address'), None, node['start_line'], node['end_line']
                ))
                node_id_map[node['path']] = cursor.lastrowid
                self.stats['dt_nodes'] += 1
            
            # DT 속성 삽입
            for prop in result['dt_properties']:
                node_id = node_id_map.get(prop['node_path'])
                if node_id:
                    cursor.execute("""
                        INSERT INTO dt_properties (node_id, name, value, line)
                        VALUES (?, ?, ?, ?)
                    """, (node_id, prop['name'], prop.get('value'), prop['line']))
        
        self.conn.commit()
    
    def save_metadata(self):
        """메타데이터 저장"""
        cursor = self.conn.cursor()
        cursor.execute("INSERT OR REPLACE INTO metadata VALUES (?, ?)", 
                      ('last_index_time', str(int(datetime.now().timestamp() * 1000))))
        cursor.execute("INSERT OR REPLACE INTO metadata VALUES (?, ?)",
                      ('project_path', str(self.project_path)))
        cursor.execute("INSERT OR REPLACE INTO metadata VALUES (?, ?)",
                      ('indexer_version', '2.0-server'))
        self.conn.commit()
    
    def save_meta_json(self, elapsed: float):
        """meta.json 저장"""
        meta = {
            'lastSaved': datetime.now().isoformat(),
            'savedBy': os.environ.get('USER', os.environ.get('USERNAME', 'unknown')),
            'indexerVersion': '2.0-server',
            'elapsed': round(elapsed, 1),
            'stats': self.stats,
        }
        
        meta_path = os.path.join(os.path.dirname(self.output_path), 'meta.json')
        with open(meta_path, 'w') as f:
            json.dump(meta, f, indent=2)


def main():
    parser = argparse.ArgumentParser(description='BSP Indexer - 서버 측 고속 인덱싱')
    parser.add_argument('project_path', help='Yocto/BSP 프로젝트 경로')
    parser.add_argument('--output', '-o', help='출력 DB 경로 (기본: {project}/.bsp-index/index.bspidx)')
    
    args = parser.parse_args()
    
    indexer = BspIndexer(args.project_path, args.output)
    output_path = indexer.run()
    
    print(f"\n✅ Index saved: {output_path}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
