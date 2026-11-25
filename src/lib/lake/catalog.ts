import { META } from './config';
import { live } from './lake.svelte';

/* The lake's tables, columns and sizes, read from the DuckLake catalog itself (metadata only: milliseconds). */

export interface TableInfo {
	name: string;
	rows: number;
	bytes: number;
	files: number;
	partition: string | null;
	columns: { name: string; type: string }[];
}

let cached: Promise<TableInfo[]> | null = null;

export function tables(): Promise<TableInfo[]> {
	cached ??= (async () => {
		const [stats, cols, parts] = await Promise.all([
			live<{ name: string; rows: number; bytes: number; files: number }>(`
SELECT t.table_name AS name, coalesce(ts.record_count, 0) AS rows, coalesce(ts.file_size_bytes, 0) AS bytes,
       (SELECT count(*) FROM ${META}.ducklake_data_file f WHERE f.table_id = t.table_id AND f.end_snapshot IS NULL) AS files
FROM ${META}.ducklake_table t LEFT JOIN ${META}.ducklake_table_stats ts USING (table_id)
WHERE t.end_snapshot IS NULL`),
			live<{ table_name: string; name: string; type: string }>(`
SELECT t.table_name, c.column_name AS name, c.column_type AS type
FROM ${META}.ducklake_table t JOIN ${META}.ducklake_column c USING (table_id)
WHERE t.end_snapshot IS NULL AND c.end_snapshot IS NULL AND c.parent_column IS NULL
ORDER BY t.table_name, c.column_order`),
			live<{ table_name: string; name: string }>(`
SELECT t.table_name, c.column_name AS name
FROM ${META}.ducklake_partition_info pi
JOIN ${META}.ducklake_partition_column pc USING (partition_id, table_id)
JOIN ${META}.ducklake_table t USING (table_id)
JOIN ${META}.ducklake_column c ON c.table_id = t.table_id AND c.column_id = pc.column_id AND c.end_snapshot IS NULL
WHERE pi.end_snapshot IS NULL AND t.end_snapshot IS NULL`)
		]);
		const colsBy = new Map<string, { name: string; type: string }[]>();
		for (const c of cols) (colsBy.get(c.table_name) ?? colsBy.set(c.table_name, []).get(c.table_name)!).push({ name: c.name, type: c.type });
		const partBy = new Map(parts.map((p) => [p.table_name, p.name]));
		return stats
			.map((s) => ({ ...s, partition: partBy.get(s.name) ?? null, columns: colsBy.get(s.name) ?? [] }))
			.sort((a, b) => a.name.localeCompare(b.name));
	})();
	cached.catch(() => (cached = null));
	return cached;
}
