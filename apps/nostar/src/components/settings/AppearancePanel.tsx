import { useAppStore } from '../../store/useAppStore';
import { cardFieldKeys, type CardField } from '../../utils/displayPreferences';
const labels: Record<CardField, [string, string]> = {
  description: ['描述', 'Description'],
  tags: ['标签', 'Tags'],
  language: ['语言', 'Language'],
  stars: ['Star 数', 'Stars'],
  license: ['许可证', 'License'],
  updated: ['更新时间', 'Updated time'],
};
export function AppearancePanel({
  t,
}: {
  t: (zh: string, en: string) => string;
}) {
  const preferences = useAppStore((s) => s.displayPreferences);
  const setPreferences = useAppStore((s) => s.setDisplayPreferences);
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">
        {t('外观与卡片', 'Appearance and cards')}
      </h3>
      <label className="flex items-center gap-3">
        {t('字号', 'Font size')}
        <select
          className="rounded-lg border p-2 bg-white dark:bg-panel-dark"
          value={preferences.fontSize}
          onChange={(e) =>
            setPreferences({
              fontSize: e.target.value as typeof preferences.fontSize,
            })
          }
        >
          <option value="small">{t('小', 'Small')}</option>
          <option value="default">{t('默认', 'Default')}</option>
          <option value="large">{t('大', 'Large')}</option>
        </select>
      </label>
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={preferences.reducedMotion}
          onChange={(e) => setPreferences({ reducedMotion: e.target.checked })}
        />
        {t('减少动画', 'Reduce motion')}
      </label>
      <fieldset className="space-y-3">
        <legend className="mb-3 font-medium">
          {t('显示的卡片字段', 'Visible card fields')}
        </legend>
        {cardFieldKeys.map((key) => (
          <label key={key} className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={preferences.cardFields[key]}
              onChange={(e) =>
                setPreferences({
                  cardFields: {
                    ...preferences.cardFields,
                    [key]: e.target.checked,
                  },
                })
              }
            />
            {t(...labels[key])}
          </label>
        ))}
      </fieldset>
    </div>
  );
}
