export interface FolderWatchConfig {
    name: string;
    path: string;
    pattern?: RegExp;
  }
  
  export interface FolderFile {
    name: string;
    fullPath: string;
    size: number;
    modifiedAt: Date;
  }