# Odak Kutusu

Odak Kutusu, mevcut Gmail hesabınızı kullanan ama Gmail veya Outlook arayüzü olmayan kişisel bir **yapay zekâ e-posta kontrol merkezi**dir. Her e-postayı Gemini ile Türkçe özetler; acil konuları, cevap vermeniz gerekenleri ve unutulan takipleri tek panelde öne çıkarır.

Bu proje artık **çok kullanıcılı (multi-user)** bir yapıya sahiptir! Herhangi biri kendi e-posta ve parolası ile kayıt olabilir, kendi Gmail hesabını bağlayabilir ve kendi şifrelenmiş gelen kutusu özetlerine ulaşabilir. Tüm kullanıcı verileri ve şifreli tokenlar PostgreSQL veritabanında güvende tutulur.

## Neler yapar?

- Çoklu kullanıcı desteği (Kayıt Ol / Giriş Yap).
- Her kullanıcı için kendi Gmail gelen kutusunu salt-okunur OAuth izniyle tarar.
- Her e-posta için Türkçe özet, önem seviyesi, önem gerekçesi ve aksiyon maddeleri çıkarır.
- `Acil`, `aksiyon gerekli`, `unutulan / takip`, `bilgi` ve `tamamlanan` görünümlerini sunar.
- E-postayı **tamamlandı** olarak işaretlemeyi veya belirli bir saate ertelemeyi destekler.
- Orijinal e-postayı Gmail'de açar.
- Telefon, tablet ve bilgisayardan kullanılabilen responsive bir web arayüzü sunar.
- Gmail bağlanır bağlanmaz ilk 100 uygun gelen kutusu e-postasını arka planda özetlemeye başlar.
- Yeni e-postaları varsayılan olarak her 15 dakikada bir kontrol eder; ekrana bakmanız veya **Postaları yenile** düğmesine basmanız gerekmez.

Uygulama e-posta göndermez, silmez, arşivlemez, okundu durumunu değiştirmez ve otomatik cevap vermez. Yapay zekâ yalnızca karar desteği üretir.

## Render'a dağıtma

Depodaki [`render.yaml`](./render.yaml), Render Blueprint olarak hazırdır. Bu Blueprint uygulamanız için otomatik olarak ücretsiz bir PostgreSQL veritabanı kurar ve bağlar.

1. Bu klasörü kendi GitHub deponuza gönderin.
2. Render'da **New + → Blueprint** seçin ve GitHub deponuzu bağlayın.
3. Blueprint kurulumu, `DATABASE_URL` değişkenini otomatik dolduracak ve `APP_ENCRYPTION_KEY` Render tarafından rastgele oluşturulacaktır.
4. İlk dağıtım bittiğinde Render'ın verdiği `https://...onrender.com` adresini açın.
5. Render hizmetinin **Environment** ekranına aşağıdaki değerleri ekleyin ve yeniden dağıtın:

| Değişken | Değer |
| --- | --- |
| `GEMINI_API_KEY` | Kendi Gemini API anahtarınız |
| `GOOGLE_CLIENT_ID` | Google Cloud OAuth Web Application istemci kimliği |
| `GOOGLE_CLIENT_SECRET` | Aynı OAuth istemcisinin sırrı |
| `GEMINI_MODEL` | İsteğe bağlı; varsayılan `gemini-2.5-flash-lite` |
| `AUTO_SYNC_MINUTES` | İsteğe bağlı; varsayılan `15`, kapatmak için `0` |

> [!NOTE]
> Render'ın ücretsiz veritabanı planı süre sınırlıdır. Daha kalıcı ve ücretsiz bir veritabanı için Supabase veya Neon.tech kullanarak aldığınız `DATABASE_URL` adresini Render'da Environment kısmına manuel olarak ekleyebilirsiniz.

## Google / Gmail OAuth kurulumu

1. Google Cloud Console'da bir proje ve OAuth consent screen oluşturun. Hedef Kitle (Audience) seçeneğini **External (Harici)** seçin.
2. **Credentials → Create credentials → OAuth client ID → Web application** ile istemci oluşturun.
3. Authorized redirect URI alanına, Render adresinizi kullanarak tam olarak şunu ekleyin:

```text
https://SIZIN-RENDER-ADRESINIZ.onrender.com/auth/google/callback
```

4. `GOOGLE_CLIENT_ID` ve `GOOGLE_CLIENT_SECRET` değerlerini Render ortam değişkenlerine ekleyin.
5. Uygulamaya girip hesap oluşturun ve ardından panel üzerinden **Gmail'i bağla** düğmesine basın.

Kod, Render'ın dış alan adını otomatik algılar ve yönlendirme adresini oluşturur. 

İstenen tek Gmail yetkisi `gmail.readonly`'dir. Google OAuth uygulaması test modundaysa kendi Google hesabınızı (veya giriş yapacak kullanıcıların hesaplarını) test kullanıcısı olarak eklemeniz gerekir.

## Gemini ayarı ve gizlilik

`GEMINI_API_KEY` yalnızca Render'ın sunucu ortamında bulunur; tarayıcıya hiç gönderilmez. E-posta metni Gemini'ye analiz amacıyla iletilir, bu nedenle kurumsal veri politikalarınızla uyumlu bir Gemini API hesabı kullanın. E-posta gövdesi, olası prompt injection içerdiği varsayılan güvenilmeyen veri olarak işlenir; model hiçbir harici işlemi yapamaz.

Gemini anahtarı henüz tanımlı değilse uygulama gerçek e-postayı atlamaz; sınırlı yerel öncelik kurallarıyla geçici bir sonuç gösterir. Gerçek Türkçe özet ve aksiyon analizi için anahtar gereklidir.

## Güvenlik sınırları

- Kullanıcı parolaları PostgreSQL veritabanında `scrypt` algoritması ile tuzlanarak (salt) güvenle tutulur (hashlenir).
- OAuth belirteçleri ve yerel özet indeksi AES-256-GCM ile şifrelenir ve kullanıcıya özel anahtarla ayrıştırılır.
- Gemini API anahtarı, OAuth sırrı, şifreleme anahtarları Git'e eklenmez.
- E-posta metni kalıcı API yanıtlarına geri verilmez; panel yalnızca gerekli özet ve metaveriyi görür.
