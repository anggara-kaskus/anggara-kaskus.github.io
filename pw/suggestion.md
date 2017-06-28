### Critical

1. **Rule #1: !!! NEVER TRUST USER INPUT !!!**

```
NOTE: Yang sekarang udah di-'sanitasi' sendiri di file config.php, tapi hanya addslashes dan itu belum cukup.
Lebih baik pakai $this->input yang sudah pakai library Security CI.
```

* Validasi semua user input, terutama yang berhubungan dengan operasi database. Input type hidden tetap bisa diedit, karena tidak semua user adalah user awam
* Gunakan fungsi bawaan CI `$this->input->post()` untuk menggantikan semua `$_POST` dan `$this->input->get()` untuk menggantikan `$_GET` untuk mengurangi XSS (Cross-Site Scripting) attack
* Gunakan sanitizer (contoh: `htmlentities`) ketika print out hasil inputan user (balikan dari database, maupun `$_POST / $_GET` yang ditampilkan langsung dari form sebelumnya). Misal ketika menampilkan nama produk di halaman detil produk

**Violation yang ditemukan:**

* Di controller `product` method `add_shop_product` ada code yang baca nama tabel dari inputan user dan sangat vulnerable untuk SQL Injection. 

2. **Query ALTER TABLE ga boleh ada di code!**

	Developer harusnya request ke System Engineer buat alter table di server staging maupun production.

	Violation yang ditemukan:

	* Di controller `product` method `__construct`

3. **Hapus unused codes karena bisa mengurangi performance**
	* Block code Smarty, mnm*, Pligg, dan unused function declaration di file `config.php` yang diload di semua halaman lebih baik dihapus kalau sudah tidak dipakai.
	* controllers/product.php:2738 - 2745 -- Unused external request
	* controllers/product.php:3801 - 3808 -- Unused external request


### Improvement

1. **Gunakan Memcache buat data yang jarang berubah tapi sering diakses**

	Kalau ini diterapin bisa sangat bantu improve banget, karena kemungkinan besar kalau freeze / keputihan, karena servernya out-of-memory ketika jalanin query berat.

	Contoh:
	* Data product yang hanya berubah ketika user mengedit data
	* Get active theme yang hanya berubah ketika admin edit default theme
	* Category, state list, district list, dan city list yang hanya berubah ketika admin edit datanya
	* Seller details & shop details

	Contoh code structurenya:

```
function insertSomething($data)
{
	$this->db->insert(TABLE, $data);

	// simpan dengan key identifier yang unik per objek Something
	$memcacheKey = 'something_' . $data['id'];
	// simpan untuk 3 hari misalnya, bisa diubah sesuai kebutuhan
	$this->memcached->save($memcacheKey, $data, time() + 3 * 84600);
}

function selectSomething($id)
{
	$memcacheKey = 'something_' . $id;
	$data = $this->memcached->get($memcacheKey);
	if (!empty($data)) {
		return $data;
	}

	// kalau belum kesimpen di memcache, build dan simpen
	$data = $this->db->get_where(TABLE, array('id' => $id))
			->row_array();
	$this->memcached->save($memcacheKey, $data, time() + 3 * 84600);
	return $data;
}

// hapus dari memcache ketika ada perubahan
function updateSomething($id, $newData)
{
	$memcacheKey = 'something_' . $id;
	$this->memcached->delete($memcacheKey);

	$this->db->update(TABLE, $newData, array('id' => $id));
}

function deleteSomething($id)
{
	$memcacheKey = 'something_' . $id;
	$this->memcached->delete($memcacheKey);

	$this->db->delete(TABLE, array('id' => $id));
}
```

```
Note #1:
Harus nyediain server dengan RAM gede (bisa terpisah dari web server).
Kebutuhan RAM bisa dikira-kira sebesar Concurrent x Jumlah memcache yang tersimpan x Besar data 

Contoh: 
Data per product 1 kB, concurent 1000, total product yg diakses 5000 jadi sekitar 5GB RAM
Kalau memory ga cukup, memcache otomatis menghapus data yang paling lama / paling duluan diinsert

Note #2:
Developer harus bisa menentukan cachenya by apa, untuk menghindari kesalahan penampilan data.
Misal untuk data seller, bisa dicache by seller_id karena unik per seller. Contoh memcache keynya jadi "seller_123", "seller_456", dll.
Get active theme cukup dicache active themenya, tidak perlu per theme id. Contoh memcache keynya jadi "shopsy_active_theme".
```

2. **Tambahkan index tabel untuk improve query time**

	Kalau pake index, tiap kali query ga perlu baca semua row di tabel tsb. Index table biasanya paling gampang dilihat dari WHERE atau JOIN

	Contoh:

	```
	SELECT * FROM something WHERE field_a = 'abc';
	-> tambahkan index field_a

	SELECT * FROM something WHERE field_a = 'abc' AND field_b = 'def';
	-> tambahkan compound index (index gabungan) field_a dan field_b

	SELECT * FROM table_a JOIN table_b ON table_a.id = table_b.foreign_id;
	-> tambahkan index foreign_id di tabel_b

	Note:
	* Untuk PRIMARY KEY sudah otomatis diindex, jadi tidak perlu ditambahkan lagi.
	* Query "FIND_IN_SET()" dan "LIKE '%any%'" tidak bisa menggunakan index. Hanya "LIKE 'any%'" (berawalan dengan ...) yang bisa menggunakan index.
	```
	Pakai Entity Relationship Diagram lebih enak nentuin indexnya. Kalau ada ERD semua tabel yang dipake boleh tuh dikirimin bro.
	
3. **Hindari penggunaan DERIVED TABLE**

```
SELECT `p`.*, `p`.`seourl` as product_seourl, `u`.`thumbnail`, `u`.`user_name`, `u`.`full_name`, `s`.`seourl`, `s`.`seller_businessname`, `s`.`review_count`, `s`.`shop_ratting`
FROM (`shopsy_product_id` as p)
JOIN `shopsy_users` as u ON `p`.`user_id`=`u`.`id`
JOIN `shopsy_seller` as s ON `p`.`user_id`=`s`.`seller_id`
JOIN (select max(created) created, product_id 
from shopsy_recent_viewed group by product_id) as r ON `r`.`product_id` = `p`.`id`
WHERE `p`.`id` IN ('1036', '735') 
AND `p`.`status` =  'Publish'
AND `s`.`status` =  'Active'
ORDER BY `r`.`created` desc
LIMIT 6 
```

Derived table `r` bisa dipisah sebagai query tersendiri. Atau bisa sebagai derived table tetapi ditambahkan juga wherenya agar tidak perlu kalkulasi seluruh row table:

```
select max(created) created, product_id 
from shopsy_recent_viewed WHERE shopsy_recent_viewed.product_id IN ('1036', '735') group by product_id
```

System Engineer juga perlu menambahkan index:

```
ALTER TABLE shopsy_recent_viewed ADD INDEX (product_id);
```

5. **Set timeout untuk request ke external site**

	* Library untuk Convert currency (`Currencyget`), resultnya bisa dicache juga tapi tidak terlalu lama (5 menit ~ 1 jam)
	* cUrl Google Maps API untuk dapetin Lat/Long Shop location
	* Fungsi `mail()` untuk kirim notifikasi favourite shop
	* Tambahkan settingan `default_socket_timeout = 5;` (5 detik) di file `php.ini` untuk set timeout `file_get_contents`


	```
	Note:
	Perlu dicek logic juga apabila request ke external site timeout, apakah berpengaruh ke flow existing code sekarang.
	Misal, apabila timeout, jumlah cicilan Kredit Plus per bulan tidak tampil.
	```

6. **Kode hapus-file-gambar-temporary lebih baik dipindahkan ke CRON**

	Bikin 1 file controller `cron.php` dengan 1 method `delete_tmp_images` isinya code tadi. System Engineer bikin 1 cron job yang jalan tiap jam, isinya jalanin command `php /var/www/html/index.php cron delete_tmp_images` (sebelumnya pastikan command tsb bisa jalan dan bener2 bisa ngehapus file temporary ketika dijalanin dari terminal)
	
7. **Cek mimetype file yang diupload user**

	Pastikan mimetype yang diupload sesuai dengan inputyang diharapkan. Misal untuk upload image, mimetype yang diperbolehkan harus berawalan `image/*`. Yang lebih bagus lagi, di library upload ditambahkan code untuk eksekusi scan virus file yang baru diupload. Misal: `exec("clamav /tmp/as8sD6");` (harus install clamav dulu di webserver dan jalankan daemon `clamavd` biar proses scannya lebih cepat. Jangan lupa System Engineer juga harus update database virus secara berkala)


### Minor
1. Gunakan engine `Memory` (sekarang masih `InnoDB`) untuk tabel `ci_sessions`. Tapi balik lagi, server MySQLnya harus punya RAM gede :D
2. Kurangi duplicate code. Code kaya di bawah bisa dimasukin 1 fungsi daripada ditulis berulang2

```
@copy('./images/product/temp_img/'.$image_upload0, './images/product/temp_upload/mb/thumb/'.$timeImg.'-'.$image_upload0);
$this->ImageResizeWithCrop(350, '', $timeImg.'-'.$image_upload0, './images/product/temp_upload/mb/thumb/');
$file 	= './images/product/temp_upload/mb/thumb/'.$timeImg.'-'.$image_upload0;
$uri 	= "images/product/mb/thumb/".$timeImg.'-'.$image_upload0;

$input = $this->s3->inputResource(fopen($file, "rb"), filesize($file));

if (S3::putObject($input, $bucket, $uri, S3::ACL_PUBLIC_READ,array(),array("Content-Type" => "image/jpeg"))){
    //echo "mb/thumb/ File uploaded.<br>";
    unlink('images/product/temp_upload/mb/thumb/'.$timeImg.'-'.$image_upload0);
}
else{
    echo "mb/thumb/ Failed to upload file.<br>";
}

```

3. **Multiple jQuery include**

	[Mobile site](https://www.pasarwarga.com/mobile) memakai 2 versi jQuery (1.7.1 dan 1.9.1). Pakai yang lebih baru dan pindahkan includenya ke paling atas sebelum include file JS yang lain.

### Logic notes

1. controllers/product.php:1289

	`seller_product_id` generatenya random? Bisa jadi 2 product punya `seller_product_id` yang sama nantinya. Sedangkan `seller_product_id` dipakai untuk Product Feedback.
	
2. controllers/product.php:2141

	`category_id` bisa multiple? kalau search `p.category_id LIKE '%{category_id}'` dan kategori id yang disearch misalnya '2', bisa match product dengan kategori id berakhiran '2' juga? misal `2`, `12`, `22`

