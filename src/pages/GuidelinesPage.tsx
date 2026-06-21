import React from 'react'
import { GuidelinesEditor } from '../components/GuidelinesEditor'
import { useTranslation } from '../hooks/useTranslation'

export const GuidelinesPage: React.FC = () => {
  const { t } = useTranslation()

  return (
    <div className="h-full overflow-y-auto bg-[var(--canvas)] p-6 md:p-8 page-enter">
      <div className="mb-8">
        <h1 className="page-title text-2xl font-medium tracking-tight text-[var(--ink)]">
          {t('sidebar.guidelines')}
        </h1>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">
          {t('settings.guidelines.subtitle')}
        </p>
      </div>
      <GuidelinesEditor showHeader={false} />
    </div>
  )
}
