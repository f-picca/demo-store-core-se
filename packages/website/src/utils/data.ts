import { getActiveJsonDataFolder } from '#utils/contentSource'
import { isSupportedUrl } from '#utils/isSupportedUrl'

/**
 * Fetch JSON from `data` folder.
 *
 * The base folder is resolved per call from the active content source (Sanity
 * ⇄ Contentful, held in Edge Config) rather than the build-time env var, so the
 * presenter can switch datasets live with no rebuild/redeploy. In SSR this runs
 * on every request; in SSG it resolves at build time to the active source.
 *
 * @param filename JSON filename that will be fetched.
 */
export async function fetchJsonData(filename: string): Promise<unknown> {
  let data: unknown

  const dataFolder = await getActiveJsonDataFolder()

  if (isSupportedUrl(dataFolder)) {
    data = fetch(`${dataFolder}/${filename}.json`)
      .then(response => response.json())
      .catch(error => {
        console.error(`Cannot fetch "${dataFolder}/${filename}.json"`, error)
        return null
      })
  } else {
    data = (await import(`aliasJsonData/${filename}.json`)).default
  }

  return data
}


/**
 * Fetch LOCALE from `data` folder.
 * @param filename JSON filename that will be fetched.
 */
export async function fetchLocaleData(filename: string): Promise<unknown> {
  let data: unknown

  if (isSupportedUrl(process.env.NEXT_PUBLIC_LOCALES_DATA_FOLDER)) {
    data = fetch(`${process.env.NEXT_PUBLIC_LOCALES_DATA_FOLDER}/${filename}.json`)
      .then(response => response.json())
      .catch(error => {
        console.error(`Cannot fetch "${process.env.NEXT_PUBLIC_LOCALES_DATA_FOLDER}/${filename}.json"`, error)
        return null
      })
  } else {
    data = (await import(`aliasLocalesData/${filename}.json`)).default
  }

  return data
}

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes'

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

export function getSize(input?: string | object) {
  return formatBytes((new TextEncoder().encode(typeof input === 'object' ? JSON.stringify(input) : input)).length)
}
