# Hubungkan SPONMUSIC ke Basic Pitch di Render

Service Python tidak diubah. Tidak ada URL aktif yang diasumsikan dan belum ada pengujian koneksi/inference.

Di pengaturan environment backend SPONMUSIC (bukan frontend dan bukan service Python), tambahkan:

NITRO_PIANO_MODEL_URL=https://DOMAIN-RENDER/transcribe

Ganti DOMAIN-RENDER dengan domain deployment Anda. Nitro membaca environment ini melalui runtimeConfig.pianoModelUrl (default kosong di nitro.config.ts). Jangan gunakan awalan VITE_: endpoint hanya dipakai backend.

Redeploy/restart backend setelah mengubah environment. Adapter menerima URL lengkap /transcribe maupun base URL domain. Base URL ditambahkan /transcribe; URL lengkap tidak menjadi /transcribe/transcribe. Trailing slash dinormalisasi. Query, fragment, dan credential di URL tidak diterima.

Request: POST multipart/form-data dengan file `audio` (audio.mp3/audio.wav) dan `task=transcription`. Boundary dibuat oleh fetch, bukan diatur manual. Tidak ada proses Python di browser.

Respons service: MIDI biner, opsional X-Estimated-BPM. Adapter memvalidasi ukuran dan header, lalu parser MIDI/engine aransemen memvalidasi isi. Output aransemen diteruskan ke alur Studio yang sudah ada. Tidak ada fallback MIDI.

Error yang diteruskan ke UI: URL salah/belum diisi; koneksi gagal; 503 model sibuk/belum siap; 413 ukuran/durasi; 415 decode; 422 audio tanpa not; HTTP lainnya; transfer terputus; respons MIDI rusak; timeout 120 detik (504); pembatalan klien. Pembatalan tidak menjamin inference Python yang sudah berjalan ikut berhenti.

Setelah Render selesai deploy:
1. Buka /health pada service untuk memastikan model dimuat (belum membuktikan inference).
2. Isi environment SPONMUSIC seperti di atas dan redeploy backend.
3. Buka halaman upload audio SPONMUSIC, gunakan MP3/WAV non-senyap milik Anda, <=60 detik / 20 MB.
4. Pastikan benar-benar menerima MIDI, bisa diunduh, dan dibuka/terdengar di Studio.
5. Uji service offline dan file invalid untuk memastikan pesan error terlihat.

GET /api/piano/status hanya menyatakan konfigurasi ada, bukan verifikasi service aktif. YouTube dan layanan berbayar tidak ditambahkan.
