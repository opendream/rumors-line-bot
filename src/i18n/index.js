
import i18n from 'i18n';
import './locales/zh_TW';
import './locales/en_XX';
import './locales/th_TH';

const LANGUAGE_CODE = process.env.LANGUAGE_CODE || 'zh_TW';

console.log(__dirname + '/locales')
console.log('LANGUAGE_CODE', LANGUAGE_CODE)
i18n.configure({
  locales:[LANGUAGE_CODE],
  defaultLocale: LANGUAGE_CODE,
  directory: __dirname + '/locales',
  updateFiles: false
});

export default i18n;