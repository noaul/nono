import type { ToastType } from '../components/ui/Toast';

/** Toast for a bulk unstar that may have partly failed. */
export function unstarResultToast(language: 'zh' | 'en', succeeded: number, total: number): { message: string; type: ToastType } {
  const failed = total - succeeded;
  if (failed === 0) {
    return {
      message: language === 'zh' ? `成功取消 ${succeeded} 个仓库的 Star` : `Successfully unstarred ${succeeded} repositories`,
      type: 'success',
    };
  }
  if (succeeded === 0) {
    return {
      message: language === 'zh' ? `${total} 个仓库取消 Star 失败` : `Failed to unstar ${total} repositories`,
      type: 'error',
    };
  }
  return {
    message: language === 'zh'
      ? `已取消 ${succeeded}/${total} 个仓库的 Star，${failed} 个失败`
      : `Unstarred ${succeeded} of ${total} repositories; ${failed} failed`,
    type: 'warning',
  };
}
