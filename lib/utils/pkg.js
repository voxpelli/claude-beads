import { readFile } from 'node:fs/promises'

/**
 * Read diarie's own package.json — peowly uses it for `--version` and help.
 *
 * @returns {Promise<import('peowly').PackageJsonLike>}
 */
export async function readPkg () {
  const pkgContent = await readFile(new URL('../../package.json', import.meta.url), 'utf8')

  return JSON.parse(pkgContent)
}
