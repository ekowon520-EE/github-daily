import 'dotenv/config';

export const cfg = {
  topN: parseInt(process.env.TOP_N || '15', 10),
  zhipuKey: process.env.ZHIPU_API_KEY || '',
  zhipuModel: process.env.ZHIPU_MODEL || 'glm-4-flash',
  wxpusher: {
    appToken: process.env.WXPUSHER_APP_TOKEN || '',
    uid: process.env.WXPUSHER_UID || '',
    topicIds: (process.env.WXPUSHER_TOPIC_IDS || '').split(',').map((s) => s.trim()).filter(Boolean),
  },
  serverchan: {
    sendKey: process.env.SCT_SENDKEY || '',
  },
  email: {
    host: process.env.SMTP_HOST || 'smtp.qq.com',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    to: process.env.SMTP_TO || process.env.SMTP_USER || '',
  },
};
