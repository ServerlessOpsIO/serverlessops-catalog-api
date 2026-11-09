import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Ajv2020 } from 'ajv/dist/2020.js'
import type { FormatsPlugin } from 'ajv-formats'

const schema = JSON.parse(
  readFileSync(
    join(
      process.cwd(),
      'specs/001-publish-catalog-events/contracts/catalog-change-event.schema.json',
    ),
    'utf8',
  ),
)

const ajv = new Ajv2020({ allErrors: true })
const addFormats: FormatsPlugin = createRequire(
  join(process.cwd(), 'package.json'),
)('ajv-formats')
addFormats(ajv)

export const validateCatalogChangeEvent = ajv.compile(schema)
