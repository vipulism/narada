import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { FolderFile, FolderWatchConfig } from "./folder.types";
import { Importer } from "../../importers/import.types";

export class FolderConnector {

  constructor(
    private readonly config: FolderWatchConfig,
    private readonly importer: Importer

  ) {}

  async scan(): Promise<void> {
    const entries = await readdir(this.config.path);

    const files: FolderFile[] = [];

    for (const fileName of entries) {
      // Ignore hidden files
      if (fileName.startsWith(".")) {
        continue;
      }

      // Pattern filter (*.xml)
      if (this.config.pattern && !this.config.pattern.test(fileName)) {
        continue;
      }

      const fullPath = join(this.config.path, fileName);

      const fileStat = await stat(fullPath);

      // Ignore directories
      if (!fileStat.isFile()) {
        continue;
      }

      files.push({
        name: fileName,
        fullPath,
        size: fileStat.size,
        modifiedAt: fileStat.mtime,
      });
    }

    // Oldest first
    files.sort(
      (a, b) => a.modifiedAt.getTime() - b.modifiedAt.getTime()
    );

    for (const file of files) {
      console.info(`📥 Importing ${file.name}`);

      try {
        const result:any = await this.importer.import(file.fullPath);

        console.info(
          `✅ ${file.name}: imported=${result?.imported}, skipped=${result.skipped}`
        );
      } catch (err) {
        console.error(`❌ Failed to import ${file.name}`, err);
      }
    }
  }
}