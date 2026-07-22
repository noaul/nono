import '@/styles/globals.css'

import type { Metadata } from 'next'
import Layout from '@/layout'
import Head from '@/layout/head'
import siteContent from '@/config/site-content.json'
import { getSiteUrl } from '@/lib/site-url'

const {
	meta: { title, description },
	theme
} = siteContent
const siteUrl = getSiteUrl()

export const metadata: Metadata = {
	metadataBase: new URL(siteUrl),
	title,
	description,
	openGraph: {
		title,
		description,
		siteName: title,
		type: 'website',
		locale: 'zh_CN',
		images: [{ url: '/images/avatar.png', alt: title }]
	},
	twitter: {
		title,
		description,
		card: 'summary',
		images: ['/images/avatar.png']
	}
}

const htmlStyle = {
	cursor: 'url(/images/cursor.svg) 2 1, auto',
	'--site-color-brand': theme.colorBrand,
	'--site-color-primary': theme.colorPrimary,
	'--site-color-secondary': theme.colorSecondary,
	'--site-color-brand-secondary': theme.colorBrandSecondary,
	'--site-color-bg': theme.colorBg,
	'--site-color-border': theme.colorBorder,
	'--site-color-card': theme.colorCard,
	'--site-color-article': theme.colorArticle
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang='zh-CN' suppressHydrationWarning style={htmlStyle}>
			<Head colorModeBootstrapSrc='/color-mode-bootstrap.js' />

			<body>
				<script
					dangerouslySetInnerHTML={{
						__html: `
					if (/windows|win32/i.test(navigator.userAgent)) {
						document.documentElement.classList.add('windows');
					}
		      `
					}}
				/>

				<Layout>{children}</Layout>
			</body>
		</html>
	)
}
