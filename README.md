# OdakPosta

OdakPosta, her kişinin kendi uygulama hesabıyla giriş yapıp kendi Gmail gelen kutusunu bağlayabildiği yapay zekâ destekli e-posta özet panelidir. Uygulama e-posta göndermez, silmez, arşivlemez veya okundu durumunu değiştirmez.

## Kullanıcı akışı

1. Kişi uygulamada kendi e-posta adresi ve en az 12 karakterlik parolasıyla hesap oluşturur.
2. Bu adresin Gmail adresi olması gerekmez. Hesap e-postası ile bağlanacak Gmail hesabı farklı olabilir.
3. Gmail bağlantısından önce kişi, verinin şifreli olarak işlenmesi ve yapay zekâ özeti etkinse Gemini'ye gönderilmesi için açık onay verir.
4. Google'ın açtığı sayfada kendi Gmail hesabını seçer. Her Gmail kimliği yalnızca bir OdakPosta hesabına bağlanabilir.
5. İlk en fazla 100 gelen kutusu e-postası arka planda özetlenir; panel yalnızca o uygulama hesabının verisini gösterir.

Bağlı Gmail değiştirildiğinde önceki Gmail'e ait özetler silinir. **Gmail'i değiştir** seçeneği Google yetkisini kaldırmayı dener ve kaydedilmiş özetleri siler. **Hesabımı ve verilerimi sil** seçeneği uygulama hesabını, oturumları, Gmail bağlantısını ve saklanan özetleri kalıcı olarak siler.

## Saklanan veriler ve güvenlik sınırı

- Parolalar `scrypt` ile tuzlanmış hash olarak saklanır; düz metin parola saklanmaz.
- Oturum kimlikleri veritabanında yalnızca hash olarak tutulur.
- Google OAuth belirteçleri ile e-posta özeti/metaverisi AES-256-GCM ile şifrelenir; yeni kayıtlar kullanıcı ve Gmail/ileti kimliğine bağlı ek doğrulama verisiyle korunur.
- Ham e-posta gövdesi yalnızca özet üretimi sırasında bellekte kullanılır; yeni kayıtlar Postgres'e ham gövde olmadan yazılır. Panel en fazla 500 şifrelenmiş özet kaydı tutar.
- E-posta gövdesi hiçbir API yanıtında tarayıcıya geri dönmez.

Önceki v1 şifreli kayıtlar varsa uygulama başlangıçta bunları v2 biçimine taşır ve çözülebilen ham gövde alanlarını kaldırır.

`APP_ENCRYPTION_KEY` dağıtımın veri anahtarıdır. En az 32 rastgele bayt olmalıdır; Render Blueprint bunu 256 bit rastgele değer olarak üretir. Bu anahtarı değiştirmek mevcut şifreli veriyi okunamaz yapar, bu yüzden güvenli biçimde yedekleyin ve rotasyon planı olmadan değiştirmeyin.

## Render Blueprint ile dağıtım

[`render.yaml`](./render.yaml) bir Render web servisi ile Free Render Postgres veritabanını bağlar. `DATABASE_URL` private bağlantı adresinden otomatik gelir; sırları kaynak koda yazmaz.

1. Depoyu GitHub'a gönderin ve Render'da **New → Blueprint** ile bağlayın.
2. Blueprint oluşturulduğunda `APP_ENCRYPTION_KEY` otomatik üretilir.
3. Servisin **Environment** ekranına şunları ekleyin:

| Değişken | Gerekli | Açıklama |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | Evet | Google OAuth Web Application istemci kimliği |
| `GOOGLE_CLIENT_SECRET` | Evet | Aynı istemcinin sırrı |
| `GEMINI_API_KEY` | AI özeti için | Billed/paid Gemini API projesinin anahtarı |
| `GEMINI_MODEL` | Hayır | Varsayılan `gemini-2.5-flash-lite` |
| `APP_ORIGIN` | Özel alan adı için | Örn. `https://posta.ornek.com`; Render varsayılan alan adını kendisi algılar |
| `AUTO_SYNC_MINUTES` | Hayır | Varsayılan `15`; kapatmak için `0` |

4. Google Cloud Console'da bir **OAuth client ID → Web application** oluşturun. Authorized redirect URI olarak şunu ekleyin:

```text
https://SIZIN-RENDER-ADRESINIZ.onrender.com/auth/google/callback
```

Özel alan adı kullanıyorsanız `APP_ORIGIN` ve Google'daki redirect URI aynı HTTPS origin olmalıdır.

### Free Render gerçeği

Bu Blueprint ilk deneme için uygundur, ancak üretim için dayanıklı değildir. Free Render Postgres 1 GB ile sınırlıdır, 30 gün sonra sona erer ve 14 günlük yükseltme süresinden sonra tüm veriler silinir. Free web servisi 15 dakika gelen istek almadığında uyur; dolayısıyla 15 dakikalık otomatik eşitleme uyku sırasında çalışmaz. Ayrıntılar için [Render Free planı](https://render.com/docs/free) ve [Blueprint başvurusu](https://render.com/docs/blueprint-spec) belgelerine bakın.

Kesintisiz otomatik eşitleme istiyorsanız web servisini `starter` planına çıkarın. Render Postgres süresi dolmadan önce veritabanını ücretli plana yükseltin veya `DATABASE_URL` değerini başka bir sağlayıcıya taşıyın. Eski tek-kullanıcılı disk kurulumundaki token/özet dosyaları otomatik taşınmaz; kullanıcıların Gmail'i yeniden bağlaması gerekir.

## Yerel geliştirme

1. `.env.example` dosyasını `.env` olarak kopyalayın.
2. Yerel veya barındırılan bir PostgreSQL bağlantı dizesini `DATABASE_URL` içine koyun.
3. `APP_ENCRYPTION_KEY`, Google OAuth ve (varsa) Gemini değerlerini ekleyin.
4. Bağımlılıkları yükleyip uygulamayı başlatın:

```text
npm install
npm start
```

Harici ve TLS kullanan bir Postgres için `DATABASE_SSL=true` kullanın. Render Blueprint'in private bağlantısı için `DATABASE_SSL=false` kalmalıdır; bağlantı Render'ın private network'ünde yapılır.

## Gmail ve Gemini için yayın öncesi zorunluluklar

`gmail.readonly` Google tarafından **restricted** scope olarak sınıflandırılır. Test modunda test kullanıcılarıyla çalışabilirsiniz; herkese açık sürüm için OAuth verification, gizlilik politikası, veri silme akışı ve sunucuda restricted veri saklandığı/iletildiği için gerekli güvenlik değerlendirmesi planlanmalıdır. Google'ın [scope listesi](https://developers.google.com/workspace/gmail/api/auth/scopes), [User Data Policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy) ve [restricted-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification) belgeleri takip edilmelidir.

Gmail içeriklerini **ücretsiz Gemini API katmanına göndermeyin**: bu katmandaki istek/yanıtlar ürün geliştirme için kullanılabilir ve insan incelemesine tabi olabilir. Herkese açık Gmail uygulaması için yalnızca ücretli/billed Gemini API projesi kullanın; ücretli katmanda istek ve yanıtlar Google ürünlerini iyileştirmek için kullanılmaz. Bkz. [Gemini API şartları](https://ai.google.dev/gemini-api/terms) ve [fiyatlandırma/veri kullanımı](https://ai.google.dev/gemini-api/docs/pricing).

Uygulama hesabı e-postası şu anda doğrulama ve parola sıfırlama hizmeti içermez. Genel kullanıma açmadan önce doğrulanmış e-posta veya Google Sign-In, kalıcı rate limit/kota ve bir iş kuyruğu ekleyin. Bu sürüm küçük kontrollü beta için temel kullanıcı izolasyonunu sağlar; geniş ölçekli herkese açık SaaS olarak henüz değerlendirilmemelidir.

## Render alternatifleri ve masaüstü seçeneği

| Seçenek | Ne zaman uygun? |
| --- | --- |
| [Neon](https://neon.com/pricing) + mevcut Node uygulaması | Postgres'i çok az kod değişikliğiyle Render'dan taşımak için; ücretsiz katman zamanla sona ermez ancak kapasitesi sınırlıdır. |
| [Supabase](https://supabase.com/pricing) | Postgres, Auth ve Row Level Security'yi birlikte istiyorsanız; çok kullanıcılı ürün için güçlü bir temel. |
| [Cloudflare Workers + D1](https://developers.cloudflare.com/d1/) | Düşük maliyetli cron/edge yaklaşımı için; D1 SQLite'dır, bu nedenle mevcut Postgres sunucusunun yeniden yazılması gerekir. |
| [Electron](https://www.electronjs.org/docs/latest/tutorial/tutorial-packaging) Windows uygulaması | Her kullanıcının verisini kendi bilgisayarında tutacağı yerel-first ürün için; OAuth sistem tarayıcısında yapılmalı ve ortak Gemini anahtarı `.exe` içine konmamalıdır. |

Neon, kısa vadede en az geçiş maliyetli Render Postgres alternatifi; Supabase ise doğrulanmış kullanıcı hesabı ve RLS eklemek istediğinizde daha uygun uzun vadeli mimaridir.
