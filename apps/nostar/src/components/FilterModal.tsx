import React, { useState, useEffect } from 'react';
import { X, Plus } from 'lucide-react';
import { Modal } from './Modal';
import { AssetFilter } from '../types';
import { useCopy } from '../i18n';
import { normalizeAssetFilters } from '../utils/assetFilters';

interface FilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  filter?: AssetFilter;
  onSave: (filter: AssetFilter) => void;
}

export const FilterModal: React.FC<FilterModalProps> = ({
  isOpen,
  onClose,
  filter,
  onSave
}) => {
  const copy = useCopy();
  const [name, setName] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [excludeKeywords, setExcludeKeywords] = useState('');
  const [includeRepos, setIncludeRepos] = useState('');
  const [alwaysExcludeRepos, setAlwaysExcludeRepos] = useState('');
  const splitRules = (value: string) => value.split(/[,\n]/).map(item => item.trim()).filter(Boolean);
  const hasRules = keywords.length > 0 || [excludeKeywords, includeRepos, alwaysExcludeRepos].some(value => splitRules(value).length > 0);

  useEffect(() => {
    if (filter) {
      setName(filter.name);
      setKeywords([...filter.keywords]);
    } else {
      setName('');
      setKeywords([]);
    }
    setNewKeyword('');
    setExcludeKeywords((filter?.excludeKeywords ?? []).join(', '));
    setIncludeRepos((filter?.includeRepos ?? []).join(', '));
    setAlwaysExcludeRepos((filter?.alwaysExcludeRepos ?? []).join(', '));
  }, [filter, isOpen]);

  const handleAddKeyword = () => {
    const trimmed = newKeyword.trim();
    if (trimmed && !keywords.includes(trimmed)) {
      setKeywords([...keywords, trimmed]);
      setNewKeyword('');
    }
  };

  const handleRemoveKeyword = (index: number) => {
    setKeywords(keywords.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    if (!name.trim() || !hasRules) {
      return;
    }

    const [savedFilter] = normalizeAssetFilters([{
      ...filter,
      id: filter?.id || Date.now().toString(),
      name: name.trim(),
      keywords,
      excludeKeywords: splitRules(excludeKeywords),
      includeRepos: splitRules(includeRepos),
      alwaysExcludeRepos: splitRules(alwaysExcludeRepos),
    }]);

    onSave(savedFilter);
    onClose();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddKeyword();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={filter ? copy('编辑过滤器', 'Edit filter') : copy('新建过滤器', 'New filter')}>
      <div className="space-y-4">
        {/* Filter Name */}
        <div>
          <label htmlFor="asset-filter-name" className="block text-sm font-medium text-gray-900 dark:text-text-primary mb-2">
            {copy('过滤器名称', 'Filter name')}
          </label>
          <input
            id="asset-filter-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={copy('例如: macOS', 'e.g. macOS')}
            className="w-full px-3 py-2 border border-black/[0.06] dark:border-white/[0.04] rounded-lg focus:ring-2 focus:ring-brand-violet focus:border-transparent bg-white dark:bg-white/[0.04] text-gray-900 dark:text-text-primary"
          />
        </div>

        {/* Keywords */}
        <div>
          <label htmlFor="asset-filter-keywords" className="block text-sm font-medium text-gray-900 dark:text-text-primary mb-2">
            {copy('匹配关键词', 'Matching keywords')}
          </label>
          
          {/* Add keyword input */}
          <div className="flex space-x-2 mb-3">
            <input
              id="asset-filter-keywords"
              type="text"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder={copy('输入关键词，如: mac, dmg', 'Enter keywords, e.g. mac, dmg')}
              className="flex-1 px-3 py-2 border border-black/[0.06] dark:border-white/[0.04] rounded-lg focus:ring-2 focus:ring-brand-violet focus:border-transparent bg-white dark:bg-white/[0.04] text-gray-900 dark:text-text-primary"
            />
            <button
              onClick={handleAddKeyword}
              disabled={!newKeyword.trim()}
              className="px-4 py-2 bg-brand-indigo text-white rounded-lg hover:bg-brand-hover dark:hover:bg-brand-indigo disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>{copy('添加', 'Add')}</span>
            </button>
          </div>

          {/* Keywords list */}
          {keywords.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-gray-700 dark:text-text-secondary">
                {copy('已添加的关键词:', 'Added keywords:')}
              </p>
              <div className="flex flex-wrap gap-2">
                {keywords.map((keyword, index) => (
                  <div
                    key={index}
                    className="flex items-center space-x-1 px-3 py-1 bg-gray-900 text-white dark:bg-white/[0.12] dark:text-white font-medium rounded-lg text-sm"
                  >
                    <span>{keyword}</span>
                    <button
                      onClick={() => handleRemoveKeyword(index)}
                      className="text-gray-500 hover:text-gray-900 dark:hover:text-text-primary transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {keywords.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-text-tertiary">
              {copy('包含关键词可留空，仅使用排除或仓库规则。', 'Matching keywords can be empty when using blacklist or repository rules.')}
            </p>
          )}
        </div>

        {[
          { id: 'excluded-keywords', label: copy('排除关键词', 'Excluded keywords'), value: excludeKeywords, setValue: setExcludeKeywords, hint: copy('包含这些词的文件不会匹配，例如 debug, symbols。', 'Files containing these words are excluded, e.g. debug, symbols.') },
          { id: 'include-repos', label: copy('始终包含仓库', 'Always include repositories'), value: includeRepos, setValue: setIncludeRepos, hint: copy('这些仓库展示全部资产，跳过关键词规则。例如 owner/repo。', 'Show all assets for these repositories, bypassing keyword rules. Use owner/repo.') },
          { id: 'exclude-repos', label: copy('始终排除仓库', 'Always exclude repositories'), value: alwaysExcludeRepos, setValue: setAlwaysExcludeRepos, hint: copy('这些仓库不会匹配本过滤器；其他已选过滤器仍可包含它们。', 'These repositories never match this filter. Other selected filters can still include them.') },
        ].map(field => (
          <div key={field.id}>
            <label htmlFor={`asset-filter-${field.id}`} className="block text-sm font-medium text-gray-900 dark:text-text-primary mb-2">{field.label}</label>
            <textarea id={`asset-filter-${field.id}`} value={field.value} onChange={event => field.setValue(event.target.value)} rows={2}
              className="w-full px-3 py-2 border border-black/[0.06] dark:border-white/[0.04] rounded-lg focus:ring-2 focus:ring-brand-violet focus:border-transparent bg-white dark:bg-white/[0.04] text-gray-900 dark:text-text-primary" />
            <p className="text-xs text-gray-500 dark:text-text-tertiary mt-1">{field.hint} {copy('用逗号或换行分隔。', 'Separate with commas or new lines.')}</p>
          </div>
        ))}

        {/* Help text */}
        <div className="bg-light-surface dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.04] rounded-lg p-3">
          <p className="text-sm text-gray-700 dark:text-text-secondary">
            <strong>{copy('提示:', 'Tip:')}</strong>{' '}
            {copy('关键词将用于匹配 GitHub Release 中的文件名。例如，添加 "mac" 和 "dmg" 关键词可以匹配包含这些字符的文件。', 'Keywords match against file names in a GitHub release. For example, "mac" and "dmg" match files containing those strings.')}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex justify-end space-x-3 pt-4 border-t dark:border-white/[0.04] mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-900 dark:text-text-primary bg-light-surface dark:bg-white/[0.04] dark:border dark:border-white/[0.04] rounded-lg hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
          >
            {copy('取消', 'Cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || !hasRules}
            className={`px-4 py-2 rounded-lg transition-colors ${(!name.trim() || !hasRules) ? 'bg-gray-300 text-gray-500 dark:bg-white/5 dark:text-text-tertiary cursor-not-allowed' : 'bg-brand-indigo text-white hover:bg-brand-hover'}`}
          >
            {filter ? copy('保存', 'Save') : copy('创建', 'Create')}
          </button>
        </div>
      </div>
    </Modal>
  );
};
