import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { Ajv2020 } from 'ajv/dist/2020.js'
import type { FormatsPlugin } from 'ajv-formats'

const schema = JSON.parse(
  readFileSync(
    new URL(
      '../../specs/001-publish-catalog-events/contracts/catalog-change-event.schema.json',
      import.meta.url,
    ),
    'utf8',
  ),
)

const ajv = new Ajv2020({ allErrors: true })
const addFormats: FormatsPlugin = createRequire(import.meta.url)('ajv-formats')
addFormats(ajv)

export const validateCatalogChangeEvent = ajv.compile(schema)
