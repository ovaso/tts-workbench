<template>
  <section class="page-shell">
    <div class="page-title">
      <h1>Arena</h1>
    </div>

    <div class="work-panel pa-6">
      <div class="arena-empty-state">
        <v-icon color="primary" icon="mdi-scale-balance" size="44" />
        <div class="arena-empty-title">盲测工作区待接入</div>
        <div class="arena-empty-body">
          后续可在这里从 Benchmark 结果中抽样，生成 A/B 盲测任务，并记录偏好、胜负和人工评价。
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.arena-empty-state {
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

.arena-empty-title {
  color: #172033;
  font-size: 1rem;
  font-weight: 700;
}

.arena-empty-body {
  max-width: 500px;
  font-size: 0.9rem;
  line-height: 1.55;
}
</style>
