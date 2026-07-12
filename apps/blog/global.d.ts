declare module '*.svg' {
	export const ReactComponent: React.FC<React.SVGProps<SVGSVGElement>>
	export default ReactComponent
}
declare module '*.svg?url' {
	const content: StaticImageData

	export default content
}
declare module '*.png' {
	const content: import('next/image').StaticImageData

	export default content
}
declare module '*.jpg' {
	const content: import('next/image').StaticImageData

	export default content
}
declare module '*.jpeg' {
	const content: import('next/image').StaticImageData

	export default content
}
declare module '*.webp' {
	const content: import('next/image').StaticImageData

	export default content
}

declare type NullableNumber = string | number | null
declare type NullableObject = Record<string, any> | null
declare type NullableArray = Record<string, any>[] | null
declare type Nullable<T> = T | null
