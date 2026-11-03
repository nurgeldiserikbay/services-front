export const locales = ['kk', 'ru'] as const;
export type Locale = (typeof locales)[number];
export function isLocale(value: string): value is Locale {
  return locales.some((locale) => locale === value);
}
export const dictionary = {
  kk: {
    brand: 'Services', title: 'Қажетті маманды немесе қызметті табыңыз',
    intro: 'Мамандар мен компаниялар. Байланысу үшін тіркелу қажет емес.',
    searchLabel: 'Қызметті немесе маманды іздеу',
    searchPlaceholder: 'Мысалы, сантехник',
    search: 'Іздеу',
    location: 'Қай жерде іздейміз?',
    scopeCity: 'Қала', scopeCountry: 'Ел', scopeGlobal: 'Бүкіл әлем',
    geoComingSoon: 'Қала мен елді таңдау географиялық каталог қосылғанда қолжетімді болады.',
    resultKinds: {professional: 'Маман', organization: 'Компания', offer: 'Қызмет'},
    results: 'Іздеу нәтижелері',
    waiting: 'Қызметтер каталогы серверге қосылғаннан кейін осы жерде көрсетіледі.',
    unavailable: 'Қазір іздеуді жүктеу мүмкін болмады. Кейінірек қайталаңыз.',
    empty: 'Бұл сұрауға сәйкес нәтиже табылмады.',
    sponsored: 'Жарнама',
    profileInfo: 'Жария профиль туралы расталған ақпарат.',
    profileUnavailableContacts: 'Байланыс тәсілдері қызмет ұсыныстарында жарияланған кезде көрсетіледі.',
    backToSearch: 'Іздеуге оралу',
    footer: 'Қызмет көрсетушімен тікелей байланысыңыз. Баға келіссөзі мен төлем платформаның міндетті бөлігі емес.',
  },
  ru: {
    brand: 'Services', title: 'Найдите специалиста или услугу',
    intro: 'Специалисты и компании. Для поиска и связи регистрация не требуется.',
    searchLabel: 'Поиск услуг и специалистов',
    searchPlaceholder: 'Например, сантехник',
    search: 'Найти',
    location: 'Где искать?',
    scopeCity: 'Город', scopeCountry: 'Страна', scopeGlobal: 'Весь мир',
    geoComingSoon: 'Выбор города и страны появится после подключения географического каталога.',
    resultKinds: {professional: 'Специалист', organization: 'Компания', offer: 'Услуга'},
    results: 'Результаты поиска',
    waiting: 'Каталог появится здесь после подключения сервера.',
    unavailable: 'Не удалось загрузить результаты. Повторите попытку позже.',
    empty: 'По вашему запросу ничего не найдено.',
    sponsored: 'Реклама',
    profileInfo: 'Публичная информация о профиле.',
    profileUnavailableContacts: 'Способы связи появятся после публикации предложений услуг.',
    backToSearch: 'Вернуться к поиску',
    footer: 'Свяжитесь с исполнителем напрямую. Торги и платежи не являются обязательной частью платформы.',
  }
} as const;
