'use client'

import type { SiteContent } from '../../stores/config-store'
import type { BackgroundImageUploads, FileItem, SocialButtonImageUploads } from './types'
import { FaviconAvatarUpload } from './favicon-avatar-upload'
import { SiteMetaForm } from './site-meta-form'
import { ArtImagesSection } from './art-images-section'
import { BackgroundImagesSection } from './background-images-section'
import { SocialButtonsSection } from './social-buttons-section'
import { PortalSection } from './portal-section'

export type { FileItem, BackgroundImageUploads, SocialButtonImageUploads } from './types'

interface SiteSettingsProps {
	formData: SiteContent
	setFormData: React.Dispatch<React.SetStateAction<SiteContent>>
	faviconItem: FileItem | null
	setFaviconItem: React.Dispatch<React.SetStateAction<FileItem | null>>
	avatarItem: FileItem | null
	setAvatarItem: React.Dispatch<React.SetStateAction<FileItem | null>>
	backgroundImageUploads: BackgroundImageUploads
	setBackgroundImageUploads: React.Dispatch<React.SetStateAction<BackgroundImageUploads>>
	socialButtonImageUploads: SocialButtonImageUploads
	setSocialButtonImageUploads: React.Dispatch<React.SetStateAction<SocialButtonImageUploads>>
}

export function SiteSettings({
	formData,
	setFormData,
	faviconItem,
	setFaviconItem,
	avatarItem,
	setAvatarItem,
	backgroundImageUploads,
	setBackgroundImageUploads,
	socialButtonImageUploads,
	setSocialButtonImageUploads
}: SiteSettingsProps) {
	return (
		<div className='space-y-6'>
			<FaviconAvatarUpload
				faviconItem={faviconItem}
				setFaviconItem={setFaviconItem}
				avatarItem={avatarItem}
				setAvatarItem={setAvatarItem}
				currentAvatarUrl={formData.meta.avatarUrl || '/images/avatar.png'}
			/>

			<SiteMetaForm formData={formData} setFormData={setFormData} />

			<ArtImagesSection formData={formData} setFormData={setFormData} />

			<PortalSection formData={formData} setFormData={setFormData} />

			<SocialButtonsSection
				formData={formData}
				setFormData={setFormData}
				socialButtonImageUploads={socialButtonImageUploads}
				setSocialButtonImageUploads={setSocialButtonImageUploads}
			/>

			<BackgroundImagesSection
				formData={formData}
				setFormData={setFormData}
				backgroundImageUploads={backgroundImageUploads}
				setBackgroundImageUploads={setBackgroundImageUploads}
			/>
		</div>
	)
}
