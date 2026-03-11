// utils/data-loader.js
// 通用数据加载器 - 封装缓存、图片下载等通用逻辑

const {
  createCacheManager,
  isRecordChanged,
  isImageKeyChanged,
  restoreImagePaths,
  updateCacheEntry,
  deleteOldImageFile
} = require('./cache-helper.js')

/**
 * 创建数据加载器
 * @param {Object} config - 配置对象
 * @param {string} config.cacheKey - 缓存键名
 * @param {string} config.dataType - 数据类型（用于日志）
 * @param {Function} config.fetchRecords - 获取记录的函数
 * @param {Function} config.transformRecord - 转换记录的函数
 * @param {Function} config.downloadImage - 下载图片的函数
 * @param {boolean} config.multiImage - 是否支持多图片
 * @returns {Object} - 数据加载器对象
 */
function createDataLoader(config) {
  const {
    cacheKey,
    dataType = '数据',
    fetchRecords,
    transformRecord,
    downloadImage,
    multiImage = false
  } = config

  const cacheManager = createCacheManager(cacheKey)

  /**
   * 加载文本数据（不下载图片）
   * @returns {Promise<{data: Array, changedIds: Set, changedImageIds: Set}>}
   */
  async function loadTextData() {
    const records = await fetchRecords()
    const cache = cacheManager.get()
    const newCache = {}
    const changedTextIds = new Set()
    const changedImageIds = new Set()

    const results = records.map(record => {
      const transformed = transformRecord(record)
      const cacheKey = transformed.id || record.record_id
      const lastModified = transformed.lastModified

      // 检查文字数据是否变化
      const isTextChanged = isRecordChanged(cache, cacheKey, lastModified)

      // 检查图片 key 是否变化
      const imageKey = multiImage ? transformed.imageKeys : transformed.imageKey
      const hasImageKeyChanged = isImageKeyChanged(cache, cacheKey, imageKey)

      // 记录变化
      if (isTextChanged && cacheKey) {
        changedTextIds.add(cacheKey)
      }
      if (hasImageKeyChanged && cacheKey) {
        changedImageIds.add(cacheKey)
      }

      // 更新缓存
      if (isTextChanged || hasImageKeyChanged || !cache[cacheKey]) {
        if (cacheKey) {
          newCache[cacheKey] = {
            lastModified,
            imageKey: multiImage ? undefined : imageKey,
            imageKeys: multiImage ? imageKey : undefined,
            imagePath: cache[cacheKey]?.imagePath || '',
            imagePaths: cache[cacheKey]?.imagePaths || []
          }
        }

        // 如果只是文字变化，保留缓存的图片路径
        if (isTextChanged && !hasImageKeyChanged && cache[cacheKey]) {
          const imagePaths = restoreImagePaths(cache, cacheKey, multiImage)
          if (multiImage) {
            transformed.images = imagePaths
            transformed.image = imagePaths[0] || ''
          } else {
            transformed.image = imagePaths
          }
        }

        return transformed
      } else {
        // 无变化：复用缓存数据
        newCache[cacheKey] = cache[cacheKey]
        const imagePaths = restoreImagePaths(cache, cacheKey, multiImage)
        if (multiImage) {
          transformed.images = imagePaths
          transformed.image = imagePaths[0] || ''
        } else {
          transformed.image = imagePaths
        }
        return transformed
      }
    })

    // 保存新缓存
    cacheManager.save(newCache)

    // 计算变化的ID集合（文字或图片变化）
    const changedIds = new Set([...changedTextIds, ...changedImageIds])

    console.log(`[飞书] ${dataType}加载${results.length}条 | 文字变更${changedTextIds.size}条 | 图片变更${changedImageIds.size}条`)

    return { data: results, changedIds, changedImageIds }
  }

  /**
   * 下载图片
   * @param {Array} dataList - 数据列表
   * @param {Function} onImageReady - 图片下载完成回调
   * @param {Set} changedImageIds - 图片变化的ID集合
   * @param {number} concurrency - 并发数
   */
  async function downloadImages(dataList, onImageReady, changedImageIds, concurrency = 2) {
    const cache = cacheManager.get()
    const imageTasks = []
    let downloadCount = 0
    let imageChangeCount = 0
    let missingImageCount = 0

    for (const item of dataList) {
      const itemId = item.id
      const imageKey = multiImage ? item.imageKeys : item.imageKey

      if (!imageKey || (Array.isArray(imageKey) && imageKey.length === 0)) {
        continue
      }

      // 检查哪些图片需要下载
      const needDownload = []

      if (multiImage && Array.isArray(imageKey)) {
        // 多图片模式
        const cachedPaths = cache[itemId]?.imagePaths || []
        const cachedKeys = cache[itemId]?.imageKeys || []

        imageKey.forEach((key, index) => {
          const cachedPath = cachedPaths[index]
          const cachedKey = cachedKeys[index]
          const imageKeyChanged = cachedKey && cachedKey !== key
          const cacheExists = cachedPath && restoreImagePaths(cache, itemId, true).includes(cachedPath)

          if (!cacheExists || imageKeyChanged) {
            needDownload.push({ key, index, cachedPath })
            downloadCount++
            if (imageKeyChanged) imageChangeCount++
            if (!cacheExists) missingImageCount++
          }
        })
      } else {
        // 单图片模式
        const cachedPath = cache[itemId]?.imagePath
        const cachedKey = cache[itemId]?.imageKey
        const imageKeyChanged = cachedKey && cachedKey !== imageKey
        const cacheExists = cachedPath && restoreImagePaths(cache, itemId, false)

        if (!cacheExists || imageKeyChanged) {
          needDownload.push({ key: imageKey, index: 0, cachedPath })
          downloadCount++
          if (imageKeyChanged) imageChangeCount++
          if (!cacheExists) missingImageCount++
        }
      }

      // 创建下载任务
      needDownload.forEach(({ key, index, cachedPath }) => {
        imageTasks.push(async () => {
          try {
            const path = await downloadImage(key, itemId, index)

            // 删除旧文件
            deleteOldImageFile(cachedPath, path)

            // 更新缓存
            if (multiImage) {
              const imagePaths = cache[itemId]?.imagePaths || []
              imagePaths[index] = path
              const validPaths = imagePaths.filter(p => p)

              updateCacheEntry(cache, itemId, item, item.lastModified, item.imageKeys, validPaths)
              item.images = validPaths
              item.image = validPaths[0] || ''
            } else {
              updateCacheEntry(cache, itemId, item, item.lastModified, key, path)
              item.image = path
            }

            cacheManager.save(cache)

            // 通知回调
            if (onImageReady) {
              onImageReady(item.name, path, itemId, index)
            }
          } catch (error) {
            console.error(`[${item.name}] 图片${multiImage ? index : ''}下载失败:`, error)
          }
        })
      })
    }

    // 并发下载
    if (imageTasks.length > 0) {
      console.log(`[飞书] ${dataType}需要下载 ${imageTasks.length} 张图片（图片变更${imageChangeCount}张 + 缺失图片${missingImageCount}张）`)
      await downloadWithLimit(imageTasks, concurrency)
      console.log(`[飞书] ${dataType}图片下载完成`)
    } else {
      console.log(`[飞书] ${dataType}所有图片已就绪，无需下载`)
    }
  }

  /**
   * 并发控制下载
   */
  async function downloadWithLimit(tasks, limit) {
    const results = []
    const executing = []

    for (const task of tasks) {
      const promise = task().then(result => {
        executing.splice(executing.indexOf(promise), 1)
        return result
      })

      results.push(promise)
      executing.push(promise)

      if (executing.length >= limit) {
        await Promise.race(executing)
      }
    }

    return Promise.all(results)
  }

  /**
   * 从缓存获取数据
   */
  function getFromCache() {
    const cache = cacheManager.get()
    return Object.values(cache).map(entry => {
      const data = { ...entry.data }

      if (multiImage) {
        const validPaths = (entry.imagePaths || []).filter(p => restoreImagePaths(cache, data.id, false))
        data.images = validPaths
        data.image = validPaths[0] || ''
      } else {
        data.image = restoreImagePaths(cache, data.id, false)
      }

      return data
    })
  }

  return {
    loadTextData,
    downloadImages,
    getFromCache,
    cacheManager
  }
}

module.exports = {
  createDataLoader
}
