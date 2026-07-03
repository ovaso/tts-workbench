<template>
  <section class="page-shell">
    <div class="page-title">
      <h1>语料库</h1>
    </div>

    <div class="work-panel pa-6">
      <div class="corpora-empty-state">
        <v-icon color="primary" icon="mdi-book-open-page-variant-outline" size="44" />
        <div class="corpora-empty-title">语料库待接入</div>
        <div class="corpora-empty-body">
          后续可在这里管理 Benchmark corpus、语料分组、标签和文本条目，供 Benches 方案引用。
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.corpora-empty-state {
  display: grid;
  place-items: center;
  gap: 8px;
  min-height: 220px;
  border: 1px dashed #b7c4d8;
  border-radius: 8px;
  background: #f8fafc;
  color: #667085;
  text-align: center;
}

.corpora-empty-title {
  color: #172033;
  font-size: 1rem;
  font-weight: 700;
}

.corpora-empty-body {
  max-width: 480px;
  font-size: 0.9rem;
  line-height: 1.55;
}
</style>
