/** Request to import a file discovered by a connector. */
export interface ImportRequest {
  filePath: string;
  sourceType: string;
  modifiedAt: number;
}

/** Outcome counts for a single import run. */
export interface ImportResult {
  attempted: number;
  imported: number;
  skipped: number;
  failed: number;
}

/** Routes and executes imports for supported file types. */
export interface Importer {
  canHandle(request: ImportRequest): boolean;
  import(request: ImportRequest): Promise<ImportResult>;
}
