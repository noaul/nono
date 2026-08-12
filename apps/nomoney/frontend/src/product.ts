export type ProductMode = 'nomoney' | 'yumi';

export const product: ProductMode = import.meta.env.MODE === 'yumi' || import.meta.env.BASE_URL.startsWith('/yumi/')
  ? 'yumi'
  : 'nomoney';

export const productMeta = product === 'yumi'
  ? {
      name: 'Yumi',
      initials: 'YU',
      subtitleZh: '服务器与域名工作台',
      subtitleEn: 'Infrastructure workspace'
    }
  : {
      name: 'NoMoney',
      initials: 'NM',
      subtitleZh: '个人资产费用工作台',
      subtitleEn: 'Personal finance workspace'
    };
