export type FieldType = 'text' | 'number' | 'date' | 'textarea';

export interface AssetField {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
}

export interface AssetPageConfig {
  endpoint: 'phones' | 'vps' | 'domains' | 'subscriptions';
  title: string;
  singular: string;
  primaryKey: string;
  secondaryKey: string;
  dueKey: string;
  fields: AssetField[];
}

export const assetPageConfigs: AssetPageConfig[] = [
  {
    endpoint: 'phones',
    title: '电话卡',
    singular: '电话卡',
    primaryKey: 'cardNumber',
    secondaryKey: 'carrier',
    dueKey: 'nextDueDate',
    fields: [
      { key: 'phoneType', label: '电话卡类型', type: 'text' },
      { key: 'cardNumber', label: '主号码 / 卡号', type: 'text', required: true },
      { key: 'poPhoneNumber', label: 'PO 电话号码', type: 'text' },
      { key: 'carrier', label: '运营商', type: 'text' },
      { key: 'planName', label: '套餐名称', type: 'text' },
      { key: 'realNamePerson', label: '实名人', type: 'text' },
      { key: 'userName', label: '使用人', type: 'text' },
      { key: 'isSecondaryCard', label: '是否副卡', type: 'text' },
      { key: 'dataAllowanceGb', label: '流量（G）', type: 'number' },
      { key: 'voiceMinutes', label: '通话（min）', type: 'number' },
      { key: 'monthlyRentMinorUnits', label: '月租', type: 'number' },
      { key: 'attachedServices', label: '附属业务备注', type: 'text' },
      { key: 'attachedServicesMinorUnits', label: '附属业务', type: 'number' },
      { key: 'discountMinorUnits', label: '减免', type: 'number' },
      { key: 'cashbackMinorUnits', label: '回款', type: 'number' },
      { key: 'countryCode', label: '国家区号', type: 'text' },
      { key: 'homeLocation', label: '归属地', type: 'text' },
      { key: 'aPhoneNumber', label: 'A 电话号码', type: 'text' },
      { key: 'mainlandNumber', label: '内地号码', type: 'text' },
      { key: 'realNameMethod', label: '实名方式', type: 'text' },
      { key: 'balanceMinorUnits', label: '余额（当地货币）', type: 'number' },
      { key: 'totalKeepaliveUntil', label: '总保号截止日期', type: 'date' },
      { key: 'keepaliveMethod', label: '保号方式', type: 'text' },
      { key: 'minimumKeepaliveAmountMinorUnits', label: '最低保号金额', type: 'number' },
      { key: 'keepaliveDays', label: '保号天数', type: 'number' },
      { key: 'billingDay', label: '扣费日', type: 'number' },
      { key: 'activateDate', label: '开卡日期', type: 'date' },
      { key: 'expireDate', label: '到期日', type: 'date' }
    ]
  },
  {
    endpoint: 'vps',
    title: 'VPS',
    singular: 'VPS',
    primaryKey: 'name',
    secondaryKey: 'provider',
    dueKey: 'nextDueDate',
    fields: [
      { key: 'name', label: '名称', type: 'text', required: true },
      { key: 'provider', label: '供应商', type: 'text' },
      { key: 'ipAddress', label: 'IP 地址', type: 'text' },
      { key: 'location', label: '机房位置', type: 'text' },
      { key: 'cpu', label: 'CPU', type: 'text' },
      { key: 'memory', label: '内存', type: 'text' },
      { key: 'storage', label: '硬盘', type: 'text' },
      { key: 'bandwidth', label: '流量 / 带宽', type: 'text' },
      { key: 'os', label: '系统', type: 'text' },
      { key: 'sshPort', label: 'SSH 端口', type: 'number' },
      { key: 'sshUser', label: 'SSH 用户', type: 'text' },
      { key: 'sshAuthType', label: 'SSH 登录方式', type: 'text' },
      { key: 'sshPassword', label: 'SSH 密码', type: 'text' },
      { key: 'sshPrivateKey', label: 'SSH 私钥', type: 'textarea' },
      { key: 'sshPrivateKeyPassphrase', label: '私钥口令', type: 'text' },
      { key: 'sshCommand', label: 'SSH 命令', type: 'text' },
      { key: 'probeUrl', label: '探针接口', type: 'text' },
      { key: 'probePort', label: '探针端口', type: 'number' },
      { key: 'probeApiKey', label: '探针密钥', type: 'text' },
      { key: 'startDate', label: '开始日期', type: 'date' },
      { key: 'expireDate', label: '到期日', type: 'date' }
    ]
  },
  {
    endpoint: 'domains',
    title: '域名',
    singular: '域名',
    primaryKey: 'domainName',
    secondaryKey: 'registrar',
    dueKey: 'expireDate',
    fields: [
      { key: 'domainName', label: '域名', type: 'text', required: true },
      { key: 'registrar', label: '注册商', type: 'text' },
      { key: 'registrarAccount', label: '服务商账号', type: 'text' },
      { key: 'dnsProvider', label: 'DNS 托管商', type: 'text' },
      { key: 'purpose', label: '用途', type: 'text' },
      { key: 'registerDate', label: '注册日期', type: 'date' },
      { key: 'lastRenewDate', label: '上次续费日期', type: 'date' },
      { key: 'domainExtension', label: '域名后缀', type: 'text' },
      { key: 'expireDate', label: '到期日', type: 'date' }
    ]
  },
  {
    endpoint: 'subscriptions',
    title: '订阅',
    singular: '订阅',
    primaryKey: 'name',
    secondaryKey: 'provider',
    dueKey: 'nextDueDate',
    fields: [
      { key: 'name', label: '订阅名称', type: 'text', required: true },
      { key: 'provider', label: '服务商', type: 'text' },
      { key: 'account', label: '账号 / 邮箱', type: 'text' },
      { key: 'category', label: '分类', type: 'text' }
    ]
  }
];
