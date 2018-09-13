### Upgrade to PHP 7

Upgrade existing code di semua platform (WEB, WAP, API, JB, core, core-forum, general) ke PHP 7.2
Ngelanjutin task Naufal sama Andy sebelumnya. Buat ngecek apakah kode perlu ada perubahan, bisa pake php-compatibility.
Coba baca https://github.com/kaskus/kaskus-forum/blob/development--php-71/README-PHP71.md, kalau masih kurang jelas bisa tektokan sama Andy / Naufal

#### Task:
* Keepup branch upgrade PHP 7 dengan development di masing-masing repo
* Jalanin php-compat, ubah kode jika diperlukan

***

### RabbitMQ for Notifications

Implement kode menggantikan cron untuk notifikasi email yang sifatnya non-immediate (user ga harus langsung nerima notifikasi. contoh: email birthday, quoted post, replied thread, dll. -- perlu dilist lagi sih apa lagi.. :P)

```
KASKUS WEB 
    |
    +---create-queue--------> RabbitMQ Server
                                     |
                                     |
 WORKERS <--------consumed-----------+
    |
    |
    +---send-notification---> SMTP Server
                                  |
                                  |
  USER <---------send-email-------+
```

Flownya:

Misal untuk script cron birthday (controller `cron.php` method `birthday`), dia query dulu semua data user yang birthday di hari itu.
Kemudian dilooping sejumlah row yang ditemukan, buat ngirim email langsung ke SMTP (`model_global->send_email`). Kalau tiba-tiba script cron kena terminate di tengah jalan (misal karena di hari itu kebetulan banyak yang ultah), jadinya sisanya ga dapet notification.

Nah proses kirim email ke SMTP ini yang nantinya diganti dengan create queue ke RabbitMQ Server. Tumpukan queue nantinya bakal diproses (consumed) sama script worker yang isinya kirim email ke SMTP non-immediate.

**Note:** Please recheck ke tim infra, harusnya SMTP server untuk immediate notif dan non-immediate dipisah biar ga ngantri lagi waktu masuk SMTP Server

#### Task:
* List semua fitur yang butuh notifikasi non-immediate
* Ganti implementasi kirim notifikasi langsung --> menjadi create queue RabbitMQ
* Bikin script worker buat consume queue dan ngirim notifikasi

***

#### Nginx Push Stream Authentication

Riset dan implementasi mekanisme autentikasi user ketika mau subscribe ke topic tertentu (misal topik yang user-specified) di nginx push server.
Mekanisme ini ada di nginx confignya. Sebelum approve subscription, parameter credential dilempar dulu ke suatu script (bisa pakai PHP atau lainnya)
Kemudian script tersebut melakukan request ke KASKUS WEB untuk verifikasi credential yang diberikan apakah terhubung dengan logged-in user. Kalau valid, baru disubscribe ke topic tersebut.


Mekanisme subscribe normal:

```
User                     push.kaskus.co.id/sub/hotthread
  |                                      |
  +----subscribe-topic------------------>+--+
  |                                      |  | user subscribed
  |                                      +<-+
  |                                      |

```

Mekanisme dengan authentikasi:

```
User                              push.kaskus.co.id/sub/user_4827392                KASKUS WEB
  |                                             |                                      |
________ alternative: valid credential ___________________________________________________
  |                                             |                                      |
  +----subscribe-topic--with-credentials------->+                                      |
  |                                             |                                      |
  |                                             +------check-session-user-valid------->+
  |                                             |                                      |
  |                                             +<-----user-credentials-is-valid-------+
  |                                             |                                      |
  |                                             +--+                                   |
  |                                             |  | user subscribed                   |
  |                                             +<-+                                   |
  |                                             |                                      |
________ alternative: invalid credential _________________________________________________

  |                                             |                                      |
  +----subscribe-topic--with-credentials------->+                                      |
  |                                             |                                      |
  |                                             +------check-session-user-valid------->+
  |                                             |                                      |
  |                                             +<-----user-credentials-not-valid------+
  |                                             |                                      |
  |                                             +--+                                   |
  |                                             |  | reject subscription               |
  |                                             +<-+                                   |
  |                                             |                                      |
```

**Task:**
* Riset & deploy nginx + Push Stream Module (udah ada di docker nginx sekarang, tapi belum nemu config yang pas -- mungkin bisa nyontek infra)
* Bikin script buat verify user credentials

***

### Client HA for Nginx Push Stream

Riset High-Availability buat Push Stream Server.

Case yang terjadi saaat ini kalau pakai HA:

1. User A subscribe ke push.kaskus.co.id, dari LB diarahkan untuk subscribe ke Push Server 1


    ```
                                                                                +=====> Push Server 1 *
                                                                                |
    User A  =========-subscribe-=========> push.kaskus.co.id (Load Balancer) ===+------ Push Server 2
                                                                                |
                                                                                +------ Push Server 3
    ```

2. Ketika User B ingin mengirim message ke User A, dari LB diarahkan untuk publish ke Push Server 3,
   padahal User A subscribenya di Push Server 1, bukan Push Server 3. Jadinya message ga kekirim ke User A


    ```
                                                                                +------ Push Server 1
                                                                                |
    User B  =========-send-notif-========> push.kaskus.co.id (Load Balancer) ===+------ Push Server 2
                                                                                |
                                                                                +=====> Push Server 3 *
    ```

**Note:** Bakalan perlu tektokan yang intense sama tim NOC

***

### Client HA for Nginx Push Stream alternative: GCP Push Engine / PubSub

Research GCP Push Engine / PubSub sebagai pilihan pengganti Client HA for Nginx Push Stream.

Mungkin yang ambil Upgrade PHP 7 bisa ambil kalau task PHP 7nya ga terlalu heavy

***

**P.S. for all:**
Jangan lupa buat bikin ide ke product yang bisa diimplementasikan di KASKUS dan bisa improve KPI tim User. Minimal satu ide harus keimplementasi yak buat accomplishment PA ^^
