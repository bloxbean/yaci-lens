import{l,M as t}from"./C97AEebF.js";let a=null;function i(){return a??=(async()=>{const[c,_,o]=await Promise.all([l(`
SELECT t.table_name AS name, coalesce(ts.record_count, 0) AS rows, coalesce(ts.file_size_bytes, 0) AS bytes,
       (SELECT count(*) FROM ${t}.ducklake_data_file f WHERE f.table_id = t.table_id AND f.end_snapshot IS NULL) AS files
FROM ${t}.ducklake_table t LEFT JOIN ${t}.ducklake_table_stats ts USING (table_id)
WHERE t.end_snapshot IS NULL`),l(`
SELECT t.table_name, c.column_name AS name, c.column_type AS type
FROM ${t}.ducklake_table t JOIN ${t}.ducklake_column c USING (table_id)
WHERE t.end_snapshot IS NULL AND c.end_snapshot IS NULL AND c.parent_column IS NULL
ORDER BY t.table_name, c.column_order`),l(`
SELECT t.table_name, c.column_name AS name
FROM ${t}.ducklake_partition_info pi
JOIN ${t}.ducklake_partition_column pc USING (partition_id, table_id)
JOIN ${t}.ducklake_table t USING (table_id)
JOIN ${t}.ducklake_column c ON c.table_id = t.table_id AND c.column_id = pc.column_id AND c.end_snapshot IS NULL
WHERE pi.end_snapshot IS NULL AND t.end_snapshot IS NULL`)]),n=new Map;for(const e of _)(n.get(e.table_name)??n.set(e.table_name,[]).get(e.table_name)).push({name:e.name,type:e.type});const s=new Map(o.map(e=>[e.table_name,e.name]));return c.map(e=>({...e,partition:s.get(e.name)??null,columns:n.get(e.name)??[]})).sort((e,m)=>e.name.localeCompare(m.name))})(),a.catch(()=>a=null),a}export{i as t};
