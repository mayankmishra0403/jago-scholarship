import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

export const DEV_ROLE_SWITCH = import.meta.env.VITE_DEV_ROLE_SWITCH === 'true'
export const DEV_SIMULATOR = import.meta.env.VITE_DEV_SIMULATOR === 'true'
export const APP_VERSION = __APP_VERSION__

declare const __APP_VERSION__: string
