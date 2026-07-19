import { ResultSetHeader } from "mysql2";
import { getDb } from "../../db/mariaConnection";
import { SmsAnalysis } from "./sms.model";

export class SmsAnalysisRepository {

  async save(
    hash: string,
    analysis: SmsAnalysis
  ): Promise<void> {

    const db = getDb();

    await db.query<ResultSetHeader>(
      `
      INSERT INTO sms_analysis
      (
        sms_id,
        category,
        subcategory,
        confidence,
        extracted_data,
        classifier,
        classifier_version,
        classified_at
      )
      VALUES
      (
        ?,?,?,?,?,?,?,?
      )
      `,
      [
        hash,
        analysis.category,
        analysis.subcategory ?? null,
        analysis.confidence,
        JSON.stringify(analysis.extractedData ?? {}),
        analysis.classifier,
        analysis.classifierVersion,
        analysis.classifiedAt,
      ]
    );

  }

}