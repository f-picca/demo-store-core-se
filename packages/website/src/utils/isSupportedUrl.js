module.exports = {
  isSupportedUrl: (url) => typeof url === 'string' && url.indexOf('://') > 0
}
