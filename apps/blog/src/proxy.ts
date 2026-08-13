import { type NextRequest, NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
	const nonce = btoa(crypto.randomUUID())
	const policy = contentSecurityPolicy(nonce)
	const requestHeaders = new Headers(request.headers)
	requestHeaders.set('x-nonce', nonce)
	requestHeaders.set('Content-Security-Policy', policy)

	const response = NextResponse.next({ request: { headers: requestHeaders } })
	response.headers.set('Content-Security-Policy', policy)
	return response
}

function contentSecurityPolicy(nonce: string) {
	const developmentScripts = process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''
	return [
		"default-src 'self'",
		`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${developmentScripts} https://www.googletagmanager.com`,
		"style-src 'self' 'unsafe-inline' https://fonts.googleapis.cn",
		"font-src 'self' data: https://fonts.gstatic.cn",
		"img-src 'self' data: blob: https:",
		"media-src 'self' blob:",
		"connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com",
		"frame-src https://player.bilibili.com",
		"worker-src 'self' blob:",
		"object-src 'none'",
		"base-uri 'self'",
		"form-action 'self'",
		"frame-ancestors 'self'",
		'upgrade-insecure-requests'
	].join('; ')
}

export const config = {
	matcher: ['/', '/((?!api|_next/static|_next/image|favicon.png|manifest.json).*)']
}
