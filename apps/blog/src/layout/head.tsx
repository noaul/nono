import Script from 'next/script'

export default function Head() {
	const analyticsId = process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID
	const hasValidAnalyticsId = analyticsId ? /^G-[A-Z0-9]+$/.test(analyticsId) : false

	return (
		<head>
			<meta name='viewport' content='width=device-width, initial-scale=1.0' />
			<link rel='manifest' href='/manifest.json' />

			<link rel='icon' href='/favicon.png' />

			<link rel='preconnect' href='https://fonts.googleapis.cn' />
			<link rel='preconnect' href='https://fonts.gstatic.cn' crossOrigin='anonymous' />

			<link href='https://fonts.googleapis.cn/css2?family=Averia+Gruesa+Libre&display=swap' rel='stylesheet' />

			{hasValidAnalyticsId && (
				<>
					<Script src={`https://www.googletagmanager.com/gtag/js?id=${analyticsId}`} />
					<Script id='google-analytics'>
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
