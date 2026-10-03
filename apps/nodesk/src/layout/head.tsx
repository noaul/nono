import Script from 'next/script'

export default function Head({ colorModeBootstrapSrc, nonce }: { colorModeBootstrapSrc?: string; nonce?: string }) {
	const analyticsId = process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID
	const hasValidAnalyticsId = analyticsId ? /^G-[A-Z0-9]+$/.test(analyticsId) : false

	return (
		<head>
			<meta name='viewport' content='width=device-width, initial-scale=1.0' />
			<meta name='theme-color' content='#eeeeee' />
			{colorModeBootstrapSrc && <script src={colorModeBootstrapSrc} nonce={nonce} />}
			<link rel='manifest' href='/manifest.json' />

			<link rel='icon' href='/favicon.png' />

			<link rel='preconnect' href='https://fonts.googleapis.cn' />
			<link rel='preconnect' href='https://fonts.gstatic.cn' crossOrigin='anonymous' />

			<link href='https://fonts.googleapis.cn/css2?family=Averia+Gruesa+Libre&display=swap' rel='stylesheet' />

			{hasValidAnalyticsId && (
				<>
					<Script nonce={nonce} src={`https://www.googletagmanager.com/gtag/js?id=${analyticsId}`} />
					<Script nonce={nonce} id='google-analytics'>
						{`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());

          gtag('config', '${analyticsId}');
        `}
					</Script>
				</>
			)}
		</head>
	)
}
