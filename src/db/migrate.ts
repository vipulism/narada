import path from "path";
import fs from "fs";
import { getDb } from "./mariaConnection";
import { RowDataPacket } from "mysql2";

interface MigrationRow extends RowDataPacket {
    filename: string;
  }

export const migrate = async () => {
    console.log("Migrating database...");
    const db = getDb();

    await db.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    const migrationsDir = path.join(__dirname, "migrations");
    const migrationFiles = fs.readdirSync(migrationsDir).filter(file => file.endsWith(".sql")).sort();

    const [rows] = await db.query<MigrationRow[]>("SELECT filename FROM schema_migrations");
    const executedMigrations = new Set(rows.map((row) => row.filename));

    for (const migrationFile of migrationFiles) {

        const migrationName = migrationFile.replace(".sql", "");

        if (executedMigrations.has(migrationName)) {
            console.log(`Migration ${migrationName} already executed`);
            continue;
        }

        const migrationPath = path.join(migrationsDir, migrationFile);
        const migrationSql = fs.readFileSync(migrationPath, "utf8");
    
        console.log(`▶️ Running migration: ${migrationName}`);
    
        await db.execute(migrationSql);
    
        await db.execute(
          "INSERT INTO schema_migrations (filename) VALUES (?)",
          [migrationName]
        );
    
        console.log(`✅ Migration completed: ${migrationName}`);
    }

    console.log("Database migrated successfully");
};
