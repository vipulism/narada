import mysql from "mysql2/promise";

let pool: mysql.Pool;

export async function connectDb(){

    const databaseUrl = process.env.DATABASE_URL;
    if(!databaseUrl){
        throw new Error("DATABASE_URL is not set");
    }

    pool = await mysql.createPool(databaseUrl as string);
    
    await pool.query("SELECT 1");
    
    console.log("🐬 MariaDB Connected");
    
}

export const getDb = () => {

    if(!pool){
        throw new Error("Database pool not initialized");
    }
    return pool;
}