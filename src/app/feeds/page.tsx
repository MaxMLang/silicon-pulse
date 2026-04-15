import { redirect } from 'next/navigation'

export default function FeedsRedirect() {
  redirect('/about#news-digests')
}
