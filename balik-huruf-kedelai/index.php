<?php
include '../components/header.php';
?>

<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Balik Huruf Kedelai</title>
  <link rel="stylesheet" href="./style.css">
  <link rel="stylesheet" href="../main.css">
</head>

<body>

  <?php renderHeader("Balik Huruf Kedelai"); ?>

  <main>

    <div class="main wrap">

      <div class="item input">
        <textarea placeholder="Masukkan huruf di sini ..." id="inputText"></textarea>
      </div>

      <div class="item convert">
        <button onclick='reverseText()'>Reverse</button>
      </div>

      <div class="item output">
        <textarea id='outputText' placeholder='Hasil akan muncul di sini...' readonly=''></textarea>
      </div>

    </div>

  </main>

  <script src="./script.js"></script>
</body>

</html>