# Odak Kutusu

Odak Kutusu, mevcut Gmail hesabınızı kullanan ama Gmail veya Outlook arayüzü olmayan kişisel bir **yapay zekâ e-posta kontrol merkezi**dir. Her e-postayı Gemini ile Türkçe özetler; acil konuları, cevap vermeniz gerekenleri ve unutulan takipleri tek panelde öne çıkarır.

Bu depo GitHub'a yüklenip Render üzerinde doğrudan çalışacak şekilde hazırlanmıştır. Anahtarlar ve parolalar kaynak koda yazılmaz.

## Neler yapar?

- Gmail gelen kutusunu salt-okunur OAuth izniyle tarar.
- Her e-posta için Türkçe özet, önem seviyesi, önem gerekçesi ve aksiyon maddeleri çıkarır.
- `Acil`, `aksiyon gerekli`, `unutulan / takip`, `bilgi` ve `tamamlanan` görünümlerini sunar.
- E-postayı **tamamlandı** olarak işaretlemeyi veya belirli bir saate ertelemeyi destekler.
- Orijinal e-postayı Gmail'de açar.
- Telefon, tablet ve bilgisayardan kullanılabilen responsive bir web arayüzü sunar.
- İstenirse uygulama açıkken otomatik eşitleme yapar.

Uygulama e-posta göndermez, silmez, arşivlemez, okundu durumunu değiştirmez ve otomatik cevap vermez. Yapay zekâ yalnızca karar desteği üretir.

## Render'a dağıtma

Depodaki [`render.yaml`](./render.yaml), Render Blueprint olarak hazırdır.

1. Bu klasörü kendi GitHub deponuza gönderin.
2. Render'da **New + → Blueprint** seçin ve GitHub deponuzu bağlayın.
3. Blueprint kurulumunda `APP_PASSWORD` için uzun, benzersiz bir parola girin. `APP_ENCRYPTION_KEY` Render tarafından rastgele oluşturulur.
4. İlk dağıtım bittiğinde Render'ın verdiği `https://...onrender.com` adresini açın.
5. Render hizmetinin **Environment** ekranına aşağıdaki değerleri ekleyin ve yeniden dağıtın:

| Değişken | Değer |
| --- | --- |
| `GEMINI_API_KEY` | Kendi Gemini API anahtarınız |
| `GOOGLE_CLIENT_ID` | Google Cloud OAuth Web Application istemci kimliği |
| `GOOGLE_CLIENT_SECRET` | Aynı OAuth istemcisinin sırrı |
| `GEMINI_MODEL` | İsteğe bağlı; varsayılan `gemini-2.5-flash-lite` |
| `AUTO_SYNC_MINUTES` | İsteğe bağlı; ör. `30`, kapatmak için `0` |

Render, çalışma dosya sistemini varsayılan olarak kalıcı tutmaz. Bu yüzden Blueprint, şifrelenmiş OAuth belirteçleri ve e-posta indeksini korumak için `/var/data` üzerinde kalıcı disk ve `starter` planı tanımlar. Diskli servisler tek örnekte çalışır; bu kişisel tek-kullanıcı uygulaması için uygun bir sınırdır. [Render Blueprint](https://render.com/docs/blueprint-spec) ve [kalıcı disk](https://render.com/docs/disks) belgeleri bu yapılandırmayı açıklar.

## Google / Gmail OAuth kurulumu

1. Google Cloud Console'da bir proje ve OAuth consent screen oluşturun.
2. **Credentials → Create credentials → OAuth client ID → Web application** ile istemci oluşturun.
3. Authorized redirect URI alanına, Render adresinizi kullanarak tam olarak şunu ekleyin:

```text
https://SIZIN-RENDER-ADRESINIZ.onrender.com/auth/google/callback
```

4. `GOOGLE_CLIENT_ID` ve `GOOGLE_CLIENT_SECRET` değerlerini Render ortam değişkenlerine ekleyin.
5. Uygulamaya girip **Gmail'i bağla** düğmesine basın.

Kod, Render'ın dış alan adını otomatik algılar ve yönlendirme adresini oluşturur. Kendi özel alan adınızı kullanırsanız `APP_ORIGIN=https://mail.sizinalanadiniz.com` ortam değişkenini ekleyin ve Google'daki redirect URI'yi aynı alan adıyla güncelleyin.

İstenen tek Gmail yetkisi `gmail.readonly`'dir. Google OAuth uygulaması test modundaysa kendi Google hesabınızı test kullanıcısı olarak eklemeniz gerekir.

## Gemini ayarı ve gizlilik

`GEMINI_API_KEY` yalnızca Render'ın sunucu ortamında bulunur; tarayıcıya hiç gönderilmez. E-posta metni Gemini'ye analiz amacıyla iletilir, bu nedenle kurumsal veri politikalarınızla uyumlu bir Gemini API hesabı kullanın. E-posta gövdesi, olası prompt injection içerdiği varsayılan güvenilmeyen veri olarak işlenir; model hiçbir harici işlemi yapamaz.

Gemini anahtarı henüz tanımlı değilse uygulama yalnızca örnek arayüzü ve sınırlı yerel öncelik kurallarını gösterir. Gerçek Türkçe özet ve aksiyon analizi için anahtar gereklidir.

## Ortam değişkenleri

| Değişken | Zorunlu | Açıklama |
| --- | --- | --- |
| `APP_PASSWORD` | Evet | Panele giriş parolası. |
| `APP_ENCRYPTION_KEY` | Evet | Yerel saklamayı AES-256-GCM ile şifreler. Render Blueprint bunu üretir. |
| `GEMINI_API_KEY` | Gemini analizi için | Gemini API anahtarınız. |
| `GOOGLE_CLIENT_ID` | Gmail bağlantısı için | OAuth Web Application istemci kimliği. |
| `GOOGLE_CLIENT_SECRET` | Gmail bağlantısı için | OAuth istemci sırrı. |
| `GOOGLE_REDIRECT_URI` | Hayır | Boşsa Render alan adından türetilir. Özel yapılandırmalar için kullanılabilir. |
| `APP_ORIGIN` | Hayır | Özel alan adı kullanıyorsanız uygulamanın HTTPS kök adresi. |
| `DATA_DIR` | Hayır | Kalıcı dosya konumu; Render için `/var/data`. |
| `AUTO_SYNC_MINUTES` | Hayır | Otomatik tarama aralığı; `0` kapalıdır. |
| `APP_TIMEZONE` | Hayır | Varsayılan `Europe/Istanbul`. |

Örnek isimleri içeren [`.env.example`](./.env.example) dosyası Git'e güvenle eklenir; gerçek `.env` dosyası `.gitignore` ile dışarıda bırakılır.

## Güvenlik sınırları

- OAuth belirteçleri ve yerel özet indeksi AES-256-GCM ile şifrelenir.
- `APP_PASSWORD` olmadan üretim modunda uygulama başlamaz.
- Gemini API anahtarı, OAuth sırrı, parolalar ve `data/` dizini Git'e eklenmez.
- E-posta metni kalıcı API yanıtlarına geri verilmez; panel yalnızca gerekli özet ve metaveriyi görür.
- Uygulamayı herkese açık bir link gibi paylaşmayın; parola korumasını açık tutun.
