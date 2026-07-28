import type { Language } from './i18n';

/**
 * English twins for the field labels and page titles in assetConfig.ts. Keeping them here
 * rather than inline means the config stays a plain data table, and any label added without a
 * translation simply falls back to the Chinese text.
 */
const EN_LABELS: Record<string, string> = {
  'A 电话号码': 'Secondary number',
  'DNS 托管商': 'DNS host',
  'IP 地址': 'IP address',
  'PO 电话号码': 'PO phone number',
  'SIM 形态': 'SIM form factor',
  'SSH 命令': 'SSH command',
  'SSH 密码': 'SSH password',
  'SSH 用户': 'SSH user',
  'SSH 登录方式': 'SSH auth method',
  'SSH 私钥': 'SSH private key',
  'SSH 端口': 'SSH port',
  'VPS 类型': 'VPS type',
  上次续费日期: 'Last renewed',
  '主号码 / 卡号': 'Primary number / SIM',
  '余额（当地货币）': 'Balance (local currency)',
  使用人: 'User',
  供应商: 'Supplier',
  保号天数: 'Keep-alive days',
  保号方式: 'Keep-alive method',
  内地号码: 'Mainland number',
  内存: 'RAM',
  减免: 'Discount',
  到期日: 'Due date',
  名称: 'Name',
  回款: 'Refund',
  国家区号: 'Country code',
  域名: 'Domain',
  域名后缀: 'TLD',
  套餐名称: 'Plan',
  实名人: 'Registered to',
  实名方式: 'Verification method',
  密钥: 'Key',
  开卡日期: 'Activated on',
  归属地: 'Region',
  总保号截止日期: 'Keep-alive deadline',
  手机号: 'Phone number',
  扣费日: 'Billing day',
  探针密钥: 'Probe key',
  探针接口: 'Probe endpoint',
  探针端口: 'Probe port',
  是否副卡: 'Secondary SIM',
  最低保号金额: 'Minimum keep-alive balance',
  月租: 'Monthly fee',
  服务商: 'Provider',
  服务商账号: 'Provider account',
  机房位置: 'Datacentre',
  注册商: 'Registrar',
  注册日期: 'Registered on',
  '流量 / 带宽': 'Traffic / bandwidth',
  '流量（G）': 'Traffic (GB)',
  用途: 'Purpose',
  电话卡类型: 'SIM type',
  硬盘: 'Disk',
  私钥口令: 'Key passphrase',
  类型: 'Type',
  系统: 'OS',
  订阅内容: 'Includes',
  设备限制: 'Device limit',
  '账号 / 邮箱': 'Account / email',
  电话卡: 'SIM cards',
  订阅: 'Subscriptions',
};

/** Singular forms differ from the plural page titles in English. */
const EN_SINGULAR: Record<string, string> = {
  电话卡: 'SIM card',
  域名: 'domain',
  订阅: 'subscription',
  VPS: 'VPS',
};

export function assetLabel(zh: string, language: Language): string {
  return language === 'zh' ? zh : EN_LABELS[zh] ?? zh;
}

export function assetSingular(zh: string, language: Language): string {
  return language === 'zh' ? zh : EN_SINGULAR[zh] ?? EN_LABELS[zh] ?? zh;
}
