import styles from "./ui.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.card}>
          <h1>Uitnodiging vereist</h1>
          <p className={styles.subtitle}>
            Deze kamer is alleen toegankelijk via een persoonlijke
            uitnodigingslink. Vraag de beheerder om een link, of open de link
            die je hebt ontvangen.
          </p>
        </div>
      </main>
    </div>
  );
}
