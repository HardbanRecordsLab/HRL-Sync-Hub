<?php
$f = '/var/www/html/wp-config.php';
$c = file_get_contents($f);
if (strpos($c, 'WP_CACHE') === false) {
    if (strpos($c, '<?php') !== false) {
        $c = str_replace('<?php', "<?php\ndefine('WP_CACHE', true);", $c);
    } else {
        $c = "<?php\ndefine('WP_CACHE', true);\n" . $c;
    }
    file_put_contents($f, $c);
    echo "WP_CACHE updated";
} else {
    echo "WP_CACHE already exists";
}
?>
