/* Public deployment addresses only. API keys belong in the server environment. */
(function (root) {
  'use strict';
  const config = Object.freeze({
    pagesOrigin: 'https://boiledeggisokay.github.io',
    pagesPath: '/HackGwinnett6.0',
    aiOrigin: 'https://hackgwinnett6-0.onrender.com'
  });
  if (typeof module === 'object' && module.exports) module.exports = config;
  else root.CareSite = config;
})(typeof window === 'object' ? window : globalThis);
