import { notFound } from 'next/navigation';

import { IconGallery } from '@/ui/IconGallery';

export default function IconGalleryPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <IconGallery />;
}
