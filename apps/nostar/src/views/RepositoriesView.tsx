import React, { useEffect } from 'react';
import { CategorySidebar } from '../components/CategorySidebar';
import { RepositoryList } from '../components/RepositoryList';
import { SearchBar } from '../components/SearchBar';
import { useAppStore } from '../store/useAppStore';
import type { AppState, SearchFilters } from '../types';

function hasActiveSearchFilters(filters: SearchFilters): boolean {
  return (
    !!filters.query.trim() ||
    filters.languages.length > 0 ||
    filters.tags.length > 0 ||
    filters.platforms.length > 0 ||
    filters.minStars !== undefined ||
    filters.maxStars !== undefined ||
    filters.isAnalyzed !== undefined ||
    filters.isSubscribed !== undefined ||
    filters.isEdited !== undefined ||
    filters.isCategoryLocked !== undefined ||
    filters.analysisFailed !== undefined ||
    filters.sortBy !== 'stars' ||
    filters.sortOrder !== 'desc'
  );
}

interface RepositoriesViewProps {
  repositories: AppState['repositories'];
  searchResults: AppState['searchResults'];
  searchFilters: AppState['searchFilters'];
  selectedCategory: string;
  onCategorySelect: (category: string) => void;
}

const RepositoriesView = React.memo(({
  repositories,
  searchResults,
  searchFilters,
  selectedCategory,
  onCategorySelect,
}: RepositoriesViewProps) => {
  const isActive = hasActiveSearchFilters(searchFilters);
  const similarView = useAppStore((state) => state.similarView);
  const exitSimilarView = useAppStore((state) => state.exitSimilarView);

  useEffect(() => {
    if (similarView?.active && isActive) exitSimilarView();
  }, [similarView?.active, isActive, exitSimilarView]);

  const listRepositories = similarView?.active
    ? similarView.similarResults
    : (isActive ? searchResults : repositories);

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
      <CategorySidebar
        repositories={repositories}
        selectedCategory={selectedCategory}
        onCategorySelect={onCategorySelect}
      />
      <div className="flex-1 space-y-6">
        <SearchBar />
        <RepositoryList
          repositories={listRepositories}
          selectedCategory={similarView?.active ? 'all' : selectedCategory}
        />
      </div>
    </div>
  );
});

RepositoriesView.displayName = 'RepositoriesView';

export default RepositoriesView;
