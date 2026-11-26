/** The title `labels` gives a path (longest matching href wins, so /pos/payments beats /payments). */
export function navPageTitle(labels: Record<string, string>, path: string): string | undefined {
  const match = Object.keys(labels)
    .filter((href) => path === href || path.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0]
  return match && labels[match]
}
