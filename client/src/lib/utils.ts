import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return `₦${new Intl.NumberFormat('en-NG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)}`
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date))
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

export function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
}

export function isActualMobileDevice(): boolean {
  if (typeof window === 'undefined') return false
  const ua = navigator.userAgent || navigator.vendor || (window as any).opera
  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua)
}

export function formatAmountInput(value: string | number): string {
  if (value === undefined || value === null || value === '') return ''
  let cleanStr = String(value).replace(/[^0-9.]/g, '')
  const firstDotIdx = cleanStr.indexOf('.')
  if (firstDotIdx !== -1) {
    cleanStr = cleanStr.slice(0, firstDotIdx + 1) + cleanStr.slice(firstDotIdx + 1).replace(/\./g, '')
  }
  const parts = cleanStr.split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  if (parts.length > 1) {
    return `${parts[0]}.${parts[1].slice(0, 2)}`
  }
  return parts[0]
}

export function parseAmountInput(value: string): number {
  if (!value) return 0
  const cleanStr = value.replace(/,/g, '')
  const parsed = parseFloat(cleanStr)
  return isNaN(parsed) ? 0 : parsed
}

