import { useState } from 'react';
import { useAppStore, getAllCategories } from '../../store/useAppStore';
/** Local edits are reviewed separately in the GitHub push preview. */
export function ListMembershipPanel({
  t,
}: {
  t: (zh: string, en: string) => string;
}) {
  const state = useAppStore();
  const [categoryId, setCategoryId] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const categories = getAllCategories(
    state.customCategories,
    state.language,
    state.hiddenDefaultCategoryIds,
    state.defaultCategoryOverrides
  ).filter((c) => state.categoryListIdMap[c.id]);
  if (!categories.length) return null;
  const available = new Set(
    state.repositories.map((r) => r.full_name.toLowerCase())
  );
  const choose = (id: string) => {
    setCategoryId(id);
    setMembers(state.githubListMemberships[id] ?? []);
    setStatus('');
  };
  return (
    <section className="mt-6 space-y-3 rounded-xl border p-4">
      <h3 className="font-semibold">
        {t('编辑导入的分类成员', 'Edit imported category members')}
      </h3>
      <p className="text-sm text-gray-600 dark:text-text-secondary">
        {t(
          '保存只修改本地归属。随后在推送预览中检查变更；移除 GitHub 成员需明确选择移除选项。',
          'Save changes local membership. Review the push preview afterward; removing GitHub members requires choosing the removal option.'
        )}
      </p>
      <label className="block">
        {t('列表分类', 'List category')}
        <select
          className="ml-3 max-w-full rounded border p-2 bg-white dark:bg-panel-dark"
          value={categoryId}
          onChange={(e) => choose(e.target.value)}
        >
          <option value="">{t('选择分类', 'Choose category')}</option>
          {categories.map((c) => (
            <option value={c.id} key={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {categoryId && (
        <>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {state.repositories.map((repo) => {
              const name = repo.full_name.toLowerCase();
              return (
                <label
                  key={repo.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={members.includes(name)}
                    onChange={(e) => {
                      setMembers((current) =>
                        e.target.checked
                          ? [...current, name]
                          : current.filter((n) => n !== name)
                      );
                      setStatus('');
                    }}
                  />
                  {repo.full_name}
                </label>
              );
            })}
            {members
              .filter((name) => !available.has(name))
              .map((name) => (
                <label key={name} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked
                    onChange={() =>
                      setMembers((current) => current.filter((n) => n !== name))
                    }
                  />
                  {name} ({t('未在本地星标中', 'not starred locally')})
                </label>
              ))}
          </div>
          <button
            className="rounded-lg border px-3 py-2 text-sm"
            onClick={() => {
              state.setLocalListMembers(categoryId, members);
              setStatus(
                t(
                  '本地成员已保存。请重新预览 GitHub 推送。',
                  'Local members saved. Preview GitHub push again.'
                )
              );
            }}
          >
            {t('保存本地成员', 'Save local members')}
          </button>
        </>
      )}
      {status && (
        <p role="status" className="text-sm">
          {status}
        </p>
      )}
    </section>
  );
}
