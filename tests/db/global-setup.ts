import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  export interface ProvidedContext {
    dbUrl: string
  }
}

const here = path.dirname(fileURLToPath(import.meta.url))
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/postgres'

export default async function setup(project: TestProject) {
  const dbName = `fotofacil_test_${process.pid}_${Date.now()}`
  const admin = new Client({ connectionString: ADMIN_URL })
  await admin.connect()
  await admin.query(`create database ${dbName}`)
  await admin.end()

  const url = new URL(ADMIN_URL)
  url.pathname = `/${dbName}`
  const db = new Client({ connectionString: url.toString() })
  await db.connect()
  await db.query(readFileSync(path.join(here, 'shim.sql'), 'utf8'))
  const migrationsDir = path.resolve(here, '../../supabase/migrations')
  for (const file of readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()) {
    await db.query(readFileSync(path.join(migrationsDir, file), 'utf8'))
  }
  await db.end()

  project.provide('dbUrl', url.toString())

  return async () => {
    const cleanup = new Client({ connectionString: ADMIN_URL })
    await cleanup.connect()
    await cleanup.query(`drop database if exists ${dbName} with (force)`)
    await cleanup.end()
  }
}
