/*
 * Where the data lives. Each network is a "frozen DuckLake" published by yaci-lens-publisher (github.com/bloxbean/yaci-lens-publisher):
 * one catalog file, the Parquet files it references, and a small summary pack, all read-only over HTTPS.
 * Self-hosting: point catalogUrl/summaryUrl at your own bucket (any S3-compatible store with public reads + CORS).
 */
export interface Network {
	id: string;
	label: string;
	/** The DuckLake catalog: ATTACH '<catalogUrl>' (TYPE ducklake) */
	catalogUrl: string;
	/** Folder holding the summary pack (epochs.parquet, daily.parquet, ...), with a trailing slash. */
	summaryUrl: string;
	/** The data source's own description (publisher, data license): metadata.json next to the catalog. */
	metadataUrl: string;
}

const env = import.meta.env;

export const NETWORKS: Network[] = [
	{
		id: 'mainnet',
		label: 'Mainnet',
		catalogUrl: env.VITE_LENS_CATALOG_URL ?? 'https://data.bloxbean.org/mainnet/v1/catalog.ducklake',
		summaryUrl: env.VITE_LENS_SUMMARY_URL ?? 'https://data.bloxbean.org/mainnet/v1/summary/',
		metadataUrl: env.VITE_LENS_DATA_METADATA_URL ?? new URL('metadata.json', env.VITE_LENS_CATALOG_URL ?? 'https://data.bloxbean.org/mainnet/v1/catalog.ducklake').href
	}
];

export const network: Network = NETWORKS[0];

/** The catalog is attached under this name and is the default database: queries can say `block` or `lake.block`. */
export const LAKE = 'lake';
/** The same catalog attached as a plain DuckDB file, to read DuckLake metadata (snapshots, files, column stats). */
export const META = 'lake_meta';

/** Rows the SQL lab keeps and renders; bigger results are cut (with a notice). */
export const MAX_RESULT_ROWS = 10_000;
