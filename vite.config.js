import vue from '@vitejs/plugin-vue2'
import { fileURLToPath } from 'node:url'
import { metaCsp } from './tools/csp.js'

const IMAGE = /\.(svg|webp|png|jpe?g|gif)$/

export default {
    base: './',
    publicDir: 'public',
    build: { outDir: 'dist' },
    esbuild: { legalComments: 'eof' },
    resolve: {
        alias: [{
            find: /^secp256k1$/,
            replacement: fileURLToPath(new URL('./resources/js/net/secp256k1.js', import.meta.url)),
        }],
    },
    plugins: [
        vue({
            template: { transformAssetUrls: false },
        }),
        {
            name: 'csp',
            apply: 'build',
            transformIndexHtml: (html) => html.replace(
                '<meta charset="utf-8">', '<meta charset="utf-8">\n    ' + metaCsp()),
        },
        {
            name: 'preload-images',
            apply: 'build',
            transformIndexHtml: (html, { bundle }) => Object.keys(bundle)
                .filter((name) => IMAGE.test(name))
                .sort()
                .map((name) => ({ tag: 'link', attrs: { rel: 'preload', as: 'image', href: './' + name }, injectTo: 'head' })),
        },
    ],
}
